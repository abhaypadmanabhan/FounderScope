import { describe, it, expect } from "vitest";
import { selectProvider } from "@/lib/llm/provider";

describe("selectProvider", () => {
  it("Anthropic only → anthropic + native search", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: null, exa: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("native");
    expect(r.config.llmKey).toBe("sk-ant-1");
    expect(r.config.exaKey).toBeNull();
  });

  it("Anthropic + EXA → anthropic + exa", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: null, exa: "exa-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("exa");
    expect(r.config.exaKey).toBe("exa-1");
  });

  it("Anthropic + Kimi (no EXA) → anthropic + native (Kimi ignored)", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: "km-1", exa: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("native");
  });

  it("Anthropic + Kimi + EXA → anthropic + exa (Anthropic wins ties)", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: "km-1", exa: "exa-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("exa");
  });

  it("Kimi + EXA → kimi + exa", () => {
    const r = selectProvider({ anthropic: null, kimi: "km-1", exa: "exa-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("kimi");
    expect(r.config.searchBackend).toBe("exa");
    expect(r.config.llmKey).toBe("km-1");
    expect(r.config.exaKey).toBe("exa-1");
  });

  it("Kimi only → error missing_search_key", () => {
    const r = selectProvider({ anthropic: null, kimi: "km-1", exa: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_search_key");
  });

  it("no LLM key → error missing_api_key", () => {
    const r = selectProvider({ anthropic: null, kimi: null, exa: "exa-1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_api_key");
  });

  it("no keys at all → error missing_api_key", () => {
    const r = selectProvider({ anthropic: null, kimi: null, exa: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_api_key");
  });
});
