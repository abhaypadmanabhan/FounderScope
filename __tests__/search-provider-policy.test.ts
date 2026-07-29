import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readCacheMock = vi.fn<(key: string) => Promise<unknown>>();
const writeCacheMock = vi.fn(
  async (
    _key: string,
    _query: string,
    _results: unknown,
    _ttlDays?: number,
  ) => undefined,
);
const cacheKeyMock = vi.fn(
  (_input: unknown, provider: string) => `${provider}-cache-key`,
);

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: (input: unknown, provider: string) =>
    cacheKeyMock(input, provider),
  readSearchCache: (key: string) => readCacheMock(key),
  writeSearchCache: (
    key: string,
    query: string,
    results: unknown,
    ttlDays?: number,
  ) => writeCacheMock(key, query, results, ttlDays),
}));

import {
  SEARCH_BUDGET,
  SearchBudgetExhaustedError,
  createSearchBudget,
  createSearchProvider,
  createSearchUsage,
} from "@/lib/search";

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  readCacheMock.mockReset();
  readCacheMock.mockResolvedValue(null);
  writeCacheMock.mockClear();
  cacheKeyMock.mockClear();
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

function providerResponse(
  provider: "firecrawl" | "tavily",
  title: string,
): Response {
  const result = {
    title,
    url: `https://${provider}.example`,
    ...(provider === "firecrawl"
      ? { description: `${title} description` }
      : { content: `${title} content` }),
  };
  const body =
    provider === "firecrawl"
      ? { success: true, data: { web: [result, result, result] } }
      : { results: [result, result, result] };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe.each(["firecrawl", "tavily"] as const)(
  "%s shared search policy",
  (providerId) => {
    it("consumes budget and counts a live call", async () => {
      fetchMock.mockResolvedValue(providerResponse(providerId, "live"));
      const budget = createSearchBudget("default");
      const usage = createSearchUsage();

      await createSearchProvider(providerId, "provider-key").search("acme", {
        budget,
        usage,
      });

      expect(budget.used).toBe(1);
      expect(usage.calls).toBe(1);
      expect(cacheKeyMock).toHaveBeenCalledWith(
        expect.objectContaining({ query: "acme" }),
        providerId,
      );
    });

    it("returns a cache hit without network I/O", async () => {
      readCacheMock.mockResolvedValueOnce({
        results: [
          {
            title: "cached",
            url: "https://cached.example",
            highlights: [],
          },
        ],
      });
      const usage = createSearchUsage();

      const results = await createSearchProvider(
        providerId,
        "provider-key",
      ).search("cached", {
        budget: createSearchBudget("default"),
        usage,
      });

      expect(results[0].title).toBe("cached");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(usage.cacheHits).toBe(1);
    });

    it("throws typed exhaustion before cache or network work", async () => {
      const budget = createSearchBudget("default");
      budget.used = SEARCH_BUDGET.default;

      await expect(
        createSearchProvider(providerId, "provider-key").search("overflow", {
          budget,
        }),
      ).rejects.toBeInstanceOf(SearchBudgetExhaustedError);
      expect(readCacheMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  },
);

describe("shared provider retry", () => {
  it("retries Tavily 429 responses and caches the successful result", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(providerResponse("tavily", "retried"));
    const usage = createSearchUsage();

    const pending = createSearchProvider("tavily", "tvly-test").search(
      "retry me",
      { budget: createSearchBudget("default"), usage },
    );
    await vi.runAllTimersAsync();
    const results = await pending;

    expect(results[0].title).toBe("retried");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(usage.calls).toBe(1);
    expect(writeCacheMock).toHaveBeenCalled();
  });
});
