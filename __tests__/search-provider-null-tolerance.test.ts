import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: (_input: unknown, provider: string) => `${provider}-key`,
  readSearchCache: async () => null,
  writeSearchCache: async () => undefined,
}));

import { createSearchBudget, createSearchProvider } from "@/lib/search";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Firecrawl null-tolerant parsing", () => {
  it("survives null entries and null/missing result fields", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            web: [
              null,
              {
                title: null,
                url: null,
                description: null,
                markdown: null,
              },
              {
                title: "Acme",
                url: "https://acme.example",
                description: "Acme builds rockets.",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const results = await createSearchProvider("firecrawl", "fc-test").search(
      "acme",
      { budget: createSearchBudget("default") },
    );

    expect(results).toEqual([
      {
        title: "Acme",
        url: "https://acme.example",
        highlights: ["Acme builds rockets."],
      },
    ]);
  });

  it("survives missing data and web keys", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const results = await createSearchProvider("firecrawl", "fc-test").search(
      "acme",
      { budget: createSearchBudget("default") },
    );

    expect(results).toEqual([]);
  });
});

describe("Tavily null-tolerant parsing", () => {
  it("survives null entries and null/missing result fields", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            null,
            { title: null, url: null, content: null },
            {
              title: "Acme",
              url: "https://acme.example",
              content: "Acme builds rockets.",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const results = await createSearchProvider("tavily", "tv-test").search(
      "acme",
      { budget: createSearchBudget("default") },
    );

    expect(results).toEqual([
      {
        title: "Acme",
        url: "https://acme.example",
        highlights: ["Acme builds rockets."],
      },
    ]);
  });

  it("survives a missing results key", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const results = await createSearchProvider("tavily", "tv-test").search(
      "acme",
      { budget: createSearchBudget("default") },
    );

    expect(results).toEqual([]);
  });
});
