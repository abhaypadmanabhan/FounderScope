import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readCacheMock = vi.fn<(key: string) => Promise<unknown>>();
const writeCacheMock = vi.fn(
  async (
    _key: string,
    _query: string,
    _results: unknown,
    _ttlDays?: number,
  ): Promise<void> => undefined,
);

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: () => "fixed-key",
  readSearchCache: (key: string) => readCacheMock(key),
  writeSearchCache: (
    key: string,
    query: string,
    results: unknown,
    ttlDays?: number,
  ) => writeCacheMock(key, query, results, ttlDays),
}));

import {
  SEARCH_BUDGET_EXHAUSTED_INSTRUCTION,
  SEARCH_BUDGET,
  SearchBudgetExhaustedError,
  createSearchBudget,
  createSearchProvider,
  createSearchUsage,
  sourceFallback,
  withSearchRetry,
} from "@/lib/search";

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  readCacheMock.mockReset();
  writeCacheMock.mockClear();
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function exaResponse(
  results: Array<{ title: string; url: string; highlights: string[] }>,
  status = 200,
): Response {
  return new Response(JSON.stringify({ results }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("EXA provider cache", () => {
  it("returns a cache hit without making a live request", async () => {
    readCacheMock.mockResolvedValueOnce({
      results: [
        {
          title: "Cached",
          url: "https://cached.example",
          highlights: ["cached result"],
        },
      ],
    });
    const usage = createSearchUsage();

    const results = await createSearchProvider("exa", "exa-test").search(
      "acme",
      { usage, budget: createSearchBudget("default") },
    );

    expect(results).toEqual([
      {
        title: "Cached",
        url: "https://cached.example",
        highlights: ["cached result"],
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usage).toEqual({
      calls: 0,
      cacheHits: 1,
      rateLimit429s: 0,
      fallbackHits: 0,
    });
  });

  it("writes a live cache miss and preserves the EXA request shape", async () => {
    readCacheMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      exaResponse([
        { title: "A", url: "https://a.example", highlights: ["a"] },
        { title: "B", url: "https://b.example", highlights: ["b"] },
        { title: "C", url: "https://c.example", highlights: ["c"] },
      ]),
    );
    const usage = createSearchUsage();

    const results = await createSearchProvider("exa", "exa-test").search(
      "acme",
      { numResults: 3, usage, budget: createSearchBudget("default") },
    );

    expect(results).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.exa.ai/search");
    expect(new Headers(init.headers).get("x-api-key")).toBe("exa-test");
    expect(JSON.parse(String(init.body))).toEqual({
      query: "acme",
      type: "auto",
      numResults: 3,
      contents: { highlights: true },
    });
    expect(writeCacheMock).toHaveBeenCalledWith(
      "fixed-key",
      "acme",
      { results },
      undefined,
    );
    expect(usage.calls).toBe(1);
  });
});

describe("EXA provider source fallback", () => {
  it("retries sparse results against canonical sources and merges unique URLs", async () => {
    readCacheMock.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(
        exaResponse([
          { title: "Primary", url: "https://same.example", highlights: [] },
        ]),
      )
      .mockResolvedValueOnce(
        exaResponse([
          { title: "Duplicate", url: "https://same.example", highlights: [] },
          { title: "Fallback", url: "https://new.example", highlights: [] },
        ]),
      );
    const usage = createSearchUsage();

    const results = await createSearchProvider("exa", "exa-test").search(
      "stealth startup",
      { usage, budget: createSearchBudget("default") },
    );

    expect(results.map((result) => result.url)).toEqual([
      "https://same.example",
      "https://new.example",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    expect(fallbackBody.includeDomains).toEqual([
      "ycombinator.com",
      "wellfound.com",
      "linkedin.com",
      "github.com",
      "sec.gov",
      "crunchbase.com",
    ]);
    expect(usage.calls).toBe(2);
    expect(usage.fallbackHits).toBe(1);
  });

  it("preserves non-domain options while replacing includeDomains", () => {
    expect(
      sourceFallback({
        query: "acme",
        numResults: 7,
        includeDomains: ["example.com"],
      }),
    ).toMatchObject({
      query: "acme",
      numResults: 7,
      includeDomains: [
        "ycombinator.com",
        "wellfound.com",
        "linkedin.com",
        "github.com",
        "sec.gov",
        "crunchbase.com",
      ],
    });
  });
});

describe("EXA retry", () => {
  it("retries 429 responses and then fails after exhausting delays", async () => {
    const operation = vi.fn(async () => {
      throw new Error("EXA 429: still rate-limited");
    });

    await expect(
      withSearchRetry("exa", operation, {
        sleep: async () => undefined,
        delays: [0, 0, 0],
      }),
    ).rejects.toThrow(/EXA 429/);
    expect(operation).toHaveBeenCalledTimes(4);
  });
});

describe("search budget", () => {
  it("keeps the existing default and reasoning caps", () => {
    expect(SEARCH_BUDGET).toEqual({ default: 8, reasoning: 10 });
  });

  it("blocks the ninth default-tier search before cache or network I/O", async () => {
    readCacheMock.mockResolvedValue(null);
    fetchMock.mockImplementation(async () =>
      exaResponse([
        { title: "A", url: "https://a.example", highlights: [] },
        { title: "B", url: "https://b.example", highlights: [] },
        { title: "C", url: "https://c.example", highlights: [] },
      ]),
    );
    const provider = createSearchProvider("exa", "exa-test");
    const budget = createSearchBudget("default");

    for (let call = 0; call < SEARCH_BUDGET.default; call++) {
      await provider.search(`query-${call}`, { budget });
    }

    await expect(provider.search("overflow", { budget })).rejects.toThrow(
      /exa search budget exhausted/,
    );
    await expect(provider.search("overflow", { budget })).rejects.toMatchObject({
      name: "SearchBudgetExhaustedError",
      instruction: SEARCH_BUDGET_EXHAUSTED_INSTRUCTION,
      providerId: "exa",
    });
    try {
      await provider.search("overflow", { budget });
    } catch (error) {
      expect(error).toBeInstanceOf(SearchBudgetExhaustedError);
      expect((error as SearchBudgetExhaustedError).instruction).toBe(
        "Write your final JSON answer now using prior search results.",
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(SEARCH_BUDGET.default);
    expect(readCacheMock).toHaveBeenCalledTimes(SEARCH_BUDGET.default);
    expect(budget.used).toBe(SEARCH_BUDGET.default);
  });
});

describe("EXA tolerant response mapping", () => {
  it("degrades null and mistyped fields exactly like the legacy mapper", async () => {
    const payloads = [
      { body: { results: null }, expected: [] },
      {
        body: {
          results: [
            {
              title: null,
              url: "https://title-null.example",
              highlights: ["title"],
            },
          ],
        },
        expected: [
          {
            title: "",
            url: "https://title-null.example",
            highlights: ["title"],
          },
        ],
      },
      {
        body: {
          results: [
            {
              title: "Highlights null",
              url: "https://highlights-null.example",
              highlights: null,
            },
          ],
        },
        expected: [
          {
            title: "Highlights null",
            url: "https://highlights-null.example",
            highlights: [],
          },
        ],
      },
      {
        body: {
          results: [{ title: "Numeric URL", url: 5, highlights: [] }],
        },
        expected: [{ title: "Numeric URL", url: 5, highlights: [] }],
      },
    ];
    const { exaSearch } = await import("@/lib/search/exa-client");

    for (const testCase of payloads) {
      fetchMock.mockResolvedValueOnce(exaResponseBody(testCase.body));
      await expect(
        exaSearch({ query: "tolerant" }, "exa-test"),
      ).resolves.toEqual(testCase.expected);
    }
  });
});

function exaResponseBody(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
