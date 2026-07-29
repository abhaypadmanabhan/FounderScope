// Key selection now has one inference provider and a required search backend.
// The two error codes are load-bearing: route.ts maps missing_api_key to 401
// and missing_search_key to 400, and the client branches on both.
import { describe, it, expect } from "vitest";
import { selectProvider } from "@/lib/llm";

describe("selectProvider", () => {
  it("accepts an OpenRouter key plus a search key, defaulting the backend to EXA", () => {
    const r = selectProvider({
      openrouter: "sk-or-v1-abc",
      search: "exa-1",
      searchProvider: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toEqual({
      openrouterKey: "sk-or-v1-abc",
      searchKey: "exa-1",
      searchProvider: "exa",
    });
  });

  it.each(["firecrawl", "tavily", "exa"] as const)(
    "honours x-search-provider: %s",
    (id) => {
      const r = selectProvider({
        openrouter: "sk-or-v1-abc",
        search: "key",
        searchProvider: id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.config.searchProvider).toBe(id);
    },
  );

  it("falls back to EXA on an unrecognised provider rather than hard-failing", () => {
    const r = selectProvider({
      openrouter: "sk-or-v1-abc",
      search: "key",
      searchProvider: "brave",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.searchProvider).toBe("exa");
  });

  it("rejects a missing OpenRouter key with missing_api_key (401 upstream)", () => {
    const r = selectProvider({
      openrouter: null,
      search: "exa-1",
      searchProvider: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_api_key");
  });

  it("rejects a missing search key with missing_search_key (400 upstream)", () => {
    const r = selectProvider({
      openrouter: "sk-or-v1-abc",
      search: null,
      searchProvider: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_search_key");
  });

  it("treats a whitespace-only key as absent", () => {
    const r = selectProvider({
      openrouter: "   ",
      search: "exa-1",
      searchProvider: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_api_key");
  });

  it("trims the keys it hands on", () => {
    const r = selectProvider({
      openrouter: "  sk-or-v1-abc  ",
      search: " exa-1 ",
      searchProvider: " TAVILY ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toEqual({
      openrouterKey: "sk-or-v1-abc",
      searchKey: "exa-1",
      searchProvider: "tavily",
    });
  });
});
