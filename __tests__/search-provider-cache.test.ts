import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

import { cacheKeyFor } from "@/lib/search/cache";
import { FALLBACK_DOMAINS } from "@/lib/search/source-fallback";

describe("search cache keys", () => {
  it("preserves the known EXA cache hashes", () => {
    expect(cacheKeyFor({ query: "stripe funding" }, "exa")).toBe(
      "abfcab299416f0f9",
    );
    expect(cacheKeyFor({ query: "acme", numResults: 3 }, "exa")).toBe(
      "757cde2a54b8f01d",
    );
    expect(
      cacheKeyFor(
        {
          query: " Stripe ",
          numResults: 7,
          includeDomains: ["YCombinator.com", "GitHub.com"],
          excludeDomains: ["Spam.com"],
          startPublishedDate: "2024-01-01",
          livecrawl: "fallback",
        },
        "exa",
      ),
    ).toBe("ed23a605e08c37d6");
    expect(
      cacheKeyFor(
        { query: "stealth", includeDomains: [...FALLBACK_DOMAINS] },
        "exa",
      ),
    ).toBe("65469267e746f356");
  });

  it("discriminates non-EXA providers without changing EXA compatibility", () => {
    const input = { query: "same query", numResults: 5 };

    expect(cacheKeyFor(input, "exa")).not.toBe(
      cacheKeyFor(input, "firecrawl"),
    );
    expect(cacheKeyFor(input, "firecrawl")).not.toBe(
      cacheKeyFor(input, "tavily"),
    );
  });
});
