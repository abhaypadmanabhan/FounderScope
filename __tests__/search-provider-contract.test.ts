import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSearchBudget,
  createSearchProvider,
  type SearchOptions,
  type SearchProvider,
} from "@/lib/search";

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: (_input: unknown, provider: string) => `${provider}-key`,
  readSearchCache: async () => null,
  writeSearchCache: async () => undefined,
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function assertProviderContract(provider: SearchProvider): void {
  expect(["exa", "firecrawl", "tavily"]).toContain(provider.id);
  expect(typeof provider.search).toBe("function");
}

describe("search provider selection", () => {
  it("uses EXA when no provider id is supplied", () => {
    const provider = createSearchProvider(undefined, "search-key");

    assertProviderContract(provider);
    expect(provider.id).toBe("exa");
  });

  it.each(["exa", "firecrawl", "tavily"] as const)(
    "creates the %s provider",
    (id) => {
      const provider = createSearchProvider(id, "search-key");

      assertProviderContract(provider);
      expect(provider.id).toBe(id);
    },
  );

  it("rejects an unsupported provider id", () => {
    expect(() => createSearchProvider("unknown", "search-key")).toThrow(
      /search provider/i,
    );
  });
});

describe("Firecrawl search provider", () => {
  it("maps the v2 search response into shared search results", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            web: [
              {
                title: "Acme",
                url: "https://acme.example",
                description: "Acme builds rockets.",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const opts: SearchOptions = {
      numResults: 3,
      includeDomains: ["acme.example"],
      excludeDomains: ["spam.example"],
      budget: createSearchBudget("default"),
    };
    const results = await createSearchProvider(
      "firecrawl",
      "fc-test",
    ).search("acme rockets", opts);

    expect(results).toEqual([
      {
        title: "Acme",
        url: "https://acme.example",
        highlights: ["Acme builds rockets."],
      },
    ]);
    expect(requests[0]?.url).toBe("https://api.firecrawl.dev/v2/search");
    expect(new Headers(requests[0]?.init.headers).get("authorization")).toBe(
      "Bearer fc-test",
    );
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({
      query: "acme rockets",
      limit: 3,
      includeDomains: ["acme.example"],
      excludeDomains: ["spam.example"],
    });
  });
});

describe("Tavily search provider", () => {
  it("maps search content into shared result highlights", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = { url: String(input), init: init ?? {} };
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Acme funding",
              url: "https://news.example/acme",
              content: "Acme raised a Series A.",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const results = await createSearchProvider("tavily", "tvly-test").search(
      "acme funding",
      {
        numResults: 4,
        startPublishedDate: "2026-01-01T23:59:59.000Z",
        budget: createSearchBudget("default"),
      },
    );

    expect(results).toEqual([
      {
        title: "Acme funding",
        url: "https://news.example/acme",
        highlights: ["Acme raised a Series A."],
      },
    ]);
    expect(request?.url).toBe("https://api.tavily.com/search");
    expect(new Headers(request?.init.headers).get("authorization")).toBe(
      "Bearer tvly-test",
    );
    expect(JSON.parse(String(request?.init.body))).toMatchObject({
      query: "acme funding",
      max_results: 4,
      search_depth: "basic",
      start_date: "2026-01-01",
    });
  });
});
