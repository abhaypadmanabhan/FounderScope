// Auto-routes to a provider + search backend based on which keys the user supplied.
// Anthropic wins ties. Kimi requires EXA (its native web tool isn't compatible).
import type { Keys, ProviderConfig } from "./types";

export type SelectError = "missing_api_key" | "missing_search_key";

export type SelectResult =
  | { ok: true; config: ProviderConfig }
  | { ok: false; error: SelectError; message: string };

export function selectProvider(keys: Keys): SelectResult {
  if (keys.anthropic) {
    return {
      ok: true,
      config: {
        provider: "anthropic",
        searchBackend: keys.exa ? "exa" : "native",
        llmKey: keys.anthropic,
        exaKey: keys.exa,
      },
    };
  }
  if (keys.kimi) {
    if (!keys.exa) {
      return {
        ok: false,
        error: "missing_search_key",
        message:
          "Kimi requires an EXA key for web search. Add an EXA key in /settings or use an Anthropic key.",
      };
    }
    return {
      ok: true,
      config: {
        provider: "kimi",
        searchBackend: "exa",
        llmKey: keys.kimi,
        exaKey: keys.exa,
      },
    };
  }
  return {
    ok: false,
    error: "missing_api_key",
    message:
      "Provide an Anthropic or Kimi key in /settings (or x-anthropic-key / x-kimi-key header).",
  };
}
