import { describe, it, expect } from "vitest";
import {
  buildKeyHeaders,
  keyReadiness,
  selectSearchKey,
  type KeyBundle,
} from "@/lib/api-keys";

function bundle(partial: Partial<KeyBundle>): KeyBundle {
  return {
    openrouter_api_key: null,
    exa_api_key: null,
    firecrawl_api_key: null,
    tavily_api_key: null,
    ...partial,
  };
}

describe("buildKeyHeaders", () => {
  it("sends the OpenRouter key as x-openrouter-key", () => {
    const headers = buildKeyHeaders(bundle({ openrouter_api_key: "sk-or-v1-abc" }));
    expect(headers["x-openrouter-key"]).toBe("sk-or-v1-abc");
  });

  it("sends an EXA key as x-search-key with no provider header", () => {
    const headers = buildKeyHeaders(
      bundle({ openrouter_api_key: "sk-or-v1-abc", exa_api_key: "exa-1" }),
    );
    expect(headers).toEqual({
      "x-openrouter-key": "sk-or-v1-abc",
      "x-search-key": "exa-1",
    });
  });

  it("names Firecrawl in x-search-provider", () => {
    const headers = buildKeyHeaders(bundle({ firecrawl_api_key: "fc-1" }));
    expect(headers).toEqual({
      "x-search-key": "fc-1",
      "x-search-provider": "firecrawl",
    });
  });

  it("names Tavily in x-search-provider", () => {
    const headers = buildKeyHeaders(bundle({ tavily_api_key: "tvly-1" }));
    expect(headers).toEqual({
      "x-search-key": "tvly-1",
      "x-search-provider": "tavily",
    });
  });

  it("never sends an Anthropic or Kimi header", () => {
    const headers = buildKeyHeaders(
      bundle({ openrouter_api_key: "sk-or-v1-abc", exa_api_key: "exa-1" }),
    );
    expect(Object.keys(headers)).not.toContain("x-anthropic-key");
    expect(Object.keys(headers)).not.toContain("x-kimi-key");
    expect(Object.keys(headers)).not.toContain("x-exa-key");
  });

  it("emits nothing when no key is set", () => {
    expect(buildKeyHeaders(bundle({}))).toEqual({});
  });

  it("ignores whitespace-only values", () => {
    expect(buildKeyHeaders(bundle({ openrouter_api_key: "   ", exa_api_key: "" }))).toEqual({});
  });

  it("trims the values it does send", () => {
    const headers = buildKeyHeaders(
      bundle({ openrouter_api_key: "  sk-or-v1-abc  ", tavily_api_key: " tvly-1 " }),
    );
    expect(headers["x-openrouter-key"]).toBe("sk-or-v1-abc");
    expect(headers["x-search-key"]).toBe("tvly-1");
  });
});

describe("selectSearchKey", () => {
  it("prefers EXA over the swap-ins", () => {
    const picked = selectSearchKey(
      bundle({ exa_api_key: "exa-1", firecrawl_api_key: "fc-1", tavily_api_key: "tvly-1" }),
    );
    expect(picked).toEqual({ provider: "exa", key: "exa-1" });
  });

  it("prefers Firecrawl over Tavily when EXA is blank", () => {
    const picked = selectSearchKey(
      bundle({ firecrawl_api_key: "fc-1", tavily_api_key: "tvly-1" }),
    );
    expect(picked).toEqual({ provider: "firecrawl", key: "fc-1" });
  });

  it("returns null when no search key is set", () => {
    expect(selectSearchKey(bundle({ openrouter_api_key: "sk-or-v1-abc" }))).toBeNull();
  });
});

describe("keyReadiness", () => {
  it("is ready with an OpenRouter key plus any search key", () => {
    expect(
      keyReadiness(bundle({ openrouter_api_key: "sk-or-v1-abc", tavily_api_key: "tvly-1" })),
    ).toEqual({ ok: true, missing: [], searchProvider: "tavily" });
  });

  it("reports a missing search key — search is required, not optional", () => {
    const readiness = keyReadiness(bundle({ openrouter_api_key: "sk-or-v1-abc" }));
    expect(readiness.ok).toBe(false);
    expect(readiness.missing).toEqual(["search"]);
  });

  it("reports a missing OpenRouter key", () => {
    const readiness = keyReadiness(bundle({ exa_api_key: "exa-1" }));
    expect(readiness.ok).toBe(false);
    expect(readiness.missing).toEqual(["openrouter"]);
    expect(readiness.searchProvider).toBe("exa");
  });

  it("reports both when the browser is empty", () => {
    expect(keyReadiness(bundle({}))).toEqual({
      ok: false,
      missing: ["openrouter", "search"],
      searchProvider: null,
    });
  });
});
