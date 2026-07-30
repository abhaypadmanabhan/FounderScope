// The source fallback is a second live, billed search. It used to run without
// debiting the budget, so a section could bill up to twice its advertised cap.
// Grounding turned that from a rare edge into the common path: a per-section
// allowlist narrows results, so the thin-result threshold is crossed on most
// sections rather than occasionally.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: (input: { query: string; includeDomains?: string[] }, provider: string) =>
    `${provider}:${input.query}:${(input.includeDomains ?? []).join(",")}`,
  readSearchCache: async () => null,
  writeSearchCache: async () => undefined,
}));

import { SEARCH_BUDGET, createSearchBudget, createSearchUsage } from "@/lib/search/budget";
import { withSearchPolicy } from "@/lib/search/policy";
import { SOURCE_FALLBACK_THRESHOLD } from "@/lib/search/source-fallback";
import type { SearchRequest } from "@/lib/search/request";
import type { RawSearchProvider, SearchResult } from "@/lib/search/types";

function result(url: string): SearchResult {
  return { title: url, url, highlights: [] };
}

/** Records every request the backend is asked for, so we can count billed calls. */
function recordingBackend(responses: SearchResult[][]): {
  backend: RawSearchProvider;
  requests: SearchRequest[];
} {
  const requests: SearchRequest[] = [];
  let call = 0;
  return {
    requests,
    backend: {
      id: "exa",
      async search(_query: string, request: SearchRequest) {
        requests.push(request);
        return responses[call++] ?? [];
      },
    } as RawSearchProvider,
  };
}

describe("source fallback budget accounting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("debits the budget for the fallback search, not just the primary", async () => {
    // A grounded query widens only on zero results, so the primary returns none.
    // See fallbackThresholdFor: applying the generic threshold of 3 to grounded
    // searches would buy a second search on nearly every section.
    expect(SOURCE_FALLBACK_THRESHOLD).toBeGreaterThan(1);
    const { backend, requests } = recordingBackend([
      [],
      [result("https://example.com/b")],
    ]);

    const budget = createSearchBudget("default");
    const usage = createSearchUsage();
    const provider = withSearchPolicy(backend);

    await provider.search("acme funding", {
      numResults: 5,
      includeDomains: ["sec.gov/edgar"],
      budget,
      usage,
    });

    expect(requests).toHaveLength(2);
    // Two live searches happened, so two slots must be spent. Before this fix
    // the count was 1 and the second search was free to the accounting layer
    // while still being billed by the provider.
    expect(budget.used).toBe(2);
    expect(usage.calls).toBe(2);
  });

  it("degrades to the primary results instead of throwing when the fallback would exceed the cap", async () => {
    const { backend, requests } = recordingBackend([
      [],
      [result("https://example.com/b")],
    ]);

    const budget = createSearchBudget("default");
    // Leave exactly one slot: enough for the primary, not for the fallback.
    budget.used = SEARCH_BUDGET[budget.tier] - 1;
    const provider = withSearchPolicy(backend);

    const results = await provider.search("acme funding", {
      numResults: 5,
      includeDomains: ["sec.gov/edgar"],
      budget,
      usage: createSearchUsage(),
    });

    expect(requests).toHaveLength(1);
    expect(results).toEqual([]);
    expect(budget.used).toBe(SEARCH_BUDGET[budget.tier]);
  });

  it("does not debit a second slot when the fallback is served from cache", async () => {
    const cache = await import("@/lib/search/cache");
    const { backend } = recordingBackend([[]]);
    let call = 0;
    vi.spyOn(cache, "readSearchCache").mockImplementation(async () => {
      // Miss on the primary, hit on the fallback.
      call += 1;
      return call === 1 ? null : { results: [result("https://cached.example/c")] };
    });

    const budget = createSearchBudget("default");
    const usage = createSearchUsage();
    await withSearchPolicy(backend).search("acme funding", {
      numResults: 5,
      includeDomains: ["sec.gov/edgar"],
      budget,
      usage,
    });

    // Only the primary was a live call. A cached fallback costs nothing.
    expect(budget.used).toBe(1);
    expect(usage.cacheHits).toBe(1);
  });
});
