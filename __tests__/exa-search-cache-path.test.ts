// handleExaSearch cache path: when the Supabase cache returns a hit,
// handleExaSearch must skip the live `exaSearch` HTTP call and mutate
// `usage.cacheHits`. When it returns a miss, the live call runs and
// `usage.calls` is mutated.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const readMock = vi.fn<(key: string) => Promise<unknown>>();
const writeMock = vi.fn<
  (key: string, query: string, results: unknown, ttlDays?: number) => Promise<void>
>(async () => undefined);

vi.mock("@/lib/llm/tools/exa-cache", () => ({
  cacheKeyFor: () => "fixed-key",
  readExaCache: (key: string) => readMock(key),
  writeExaCache: (key: string, query: string, results: unknown, ttlDays?: number) =>
    writeMock(key, query, results, ttlDays),
}));

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  readMock.mockReset();
  writeMock.mockClear();
  fetchMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = fetchMock as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { handleExaSearch, createExaUsage } from "@/lib/llm/tools/exa-search";

describe("handleExaSearch — cache layer", () => {
  it("returns cached payload without calling fetch and bumps cacheHits", async () => {
    readMock.mockResolvedValueOnce({
      results: [{ title: "cached", url: "https://c.example", highlights: [] }],
    });
    const usage = createExaUsage();
    const out = await handleExaSearch({ query: "x" }, "exa-key", usage);
    expect(JSON.parse(out)).toEqual({
      results: [{ title: "cached", url: "https://c.example", highlights: [] }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usage.cacheHits).toBe(1);
    expect(usage.calls).toBe(0);
  });

  it("on cache miss, calls Exa, writes to cache, and bumps calls", async () => {
    readMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { title: "live", url: "https://l.example", highlights: ["hl"] },
            { title: "live2", url: "https://l2.example", highlights: ["hl2"] },
            { title: "live3", url: "https://l3.example", highlights: ["hl3"] },
          ],
        }),
        { status: 200 },
      ),
    );
    const usage = createExaUsage();
    const out = await handleExaSearch({ query: "x" }, "exa-key", usage);
    expect(JSON.parse(out).results).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalled();
    expect(usage.calls).toBe(1);
    expect(usage.cacheHits).toBe(0);
    expect(usage.fallbackHits).toBe(0);
  });

  it("triggers source-fallback when primary returns <3 results, bumps fallbackHits", async () => {
    readMock.mockResolvedValue(null);
    // Primary: 1 result. Fallback: 2 results. After merge: 3 results.
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ title: "p1", url: "https://p1.example", highlights: [] }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              { title: "f1", url: "https://f1.example", highlights: [] },
              { title: "f2", url: "https://f2.example", highlights: [] },
            ],
          }),
          { status: 200 },
        ),
      );
    const usage = createExaUsage();
    const out = await handleExaSearch({ query: "stealth" }, "exa-key", usage);
    const parsed = JSON.parse(out);
    // Merged and unique by url
    expect(parsed.results.map((r: { url: string }) => r.url)).toEqual([
      "https://p1.example",
      "https://f1.example",
      "https://f2.example",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(usage.calls).toBe(2);
    expect(usage.fallbackHits).toBe(1);
  });

  it("returns a stringified error blob on persistent EXA 429 (after retries) and bumps rateLimit429s", async () => {
    readMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response("nope", { status: 429 }));
    const usage = createExaUsage();
    // withExaRetry will retry; we don't control its delays from here, so this
    // test only asserts the final shape and counter side-effects.
    const out = await handleExaSearch({ query: "x" }, "exa-key", usage);
    const parsed = JSON.parse(out);
    expect(parsed.error).toMatch(/EXA 429/);
    expect(usage.rateLimit429s).toBe(1);
  }, 30_000);
});
