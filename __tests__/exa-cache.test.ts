// exa-cache — best-effort Supabase read/write helpers. Hot path must never
// fail when Supabase is unreachable, so all paths swallow errors and return
// the safe default (null on read, no-op on write).
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client before importing the module under test.
const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import {
  cacheKeyFor,
  readExaCache,
  writeExaCache,
} from "@/lib/llm/tools/exa-cache";

beforeEach(() => {
  fromMock.mockReset();
});

describe("cacheKeyFor", () => {
  it("produces a stable hash for identical inputs", () => {
    const a = cacheKeyFor({ query: "stripe", numResults: 5 });
    const b = cacheKeyFor({ query: "stripe", numResults: 5 });
    expect(a).toBe(b);
    // FNV-1a 64-bit hex (16 chars), 0-padded.
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("normalizes case + whitespace in the query", () => {
    const a = cacheKeyFor({ query: "  Stripe  " });
    const b = cacheKeyFor({ query: "stripe" });
    expect(a).toBe(b);
  });

  it("treats includeDomains as order-independent", () => {
    const a = cacheKeyFor({
      query: "x",
      includeDomains: ["github.com", "ycombinator.com"],
    });
    const b = cacheKeyFor({
      query: "x",
      includeDomains: ["ycombinator.com", "github.com"],
    });
    expect(a).toBe(b);
  });

  it("produces different hashes when numResults differs", () => {
    const a = cacheKeyFor({ query: "x", numResults: 3 });
    const b = cacheKeyFor({ query: "x", numResults: 5 });
    expect(a).not.toBe(b);
  });
});

describe("readExaCache", () => {
  it("returns cached results when expires_at is in the future", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              results_json: { results: [{ title: "t", url: "u", highlights: [] }] },
              expires_at: future,
            },
            error: null,
          }),
        }),
      }),
    });
    const out = await readExaCache("hash");
    expect(out).not.toBeNull();
    expect(out!.results).toHaveLength(1);
  });

  it("returns null when the row is expired", async () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { results_json: { results: [] }, expires_at: past },
            error: null,
          }),
        }),
      }),
    });
    expect(await readExaCache("hash")).toBeNull();
  });

  it("returns null when no row is found", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    });
    expect(await readExaCache("hash")).toBeNull();
  });

  it("returns null when Supabase throws (network / RLS / etc.)", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            throw new Error("connection refused");
          },
        }),
      }),
    });
    // No throw — hot path safe.
    expect(await readExaCache("hash")).toBeNull();
  });
});

describe("writeExaCache", () => {
  it("upserts results with computed expires_at and never throws on error", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({ upsert });
    await writeExaCache("k", "stripe", { results: [] }, 7);
    expect(upsert).toHaveBeenCalled();
    const calls = upsert.mock.calls as unknown as unknown[][];
    const row = calls[0][0] as {
      query_hash: string;
      query_text: string;
      results_json: unknown;
      expires_at: string;
    };
    expect(row.query_hash).toBe("k");
    expect(row.query_text).toBe("stripe");
    // expires_at parses as a date, set ~7 days out
    const ms = new Date(row.expires_at).getTime() - Date.now();
    expect(ms).toBeGreaterThan(6 * 86_400_000);
    expect(ms).toBeLessThan(8 * 86_400_000);
  });

  it("swallows Supabase upsert failures", async () => {
    fromMock.mockReturnValue({
      upsert: async () => {
        throw new Error("upsert failed");
      },
    });
    await expect(
      writeExaCache("k", "q", { results: [] }),
    ).resolves.toBeUndefined();
  });
});
