// Turns raw BYOK material into a usable provider config. Replaces the old
// anthropic-vs-kimi routing: there is one inference provider now, so the only
// decision left is which search backend the user's key belongs to.
import type { Keys, ProviderConfig, SearchProviderId } from "./types";

export type SelectError = "missing_api_key" | "missing_search_key";

export type SelectResult =
  | { ok: true; config: ProviderConfig }
  | { ok: false; error: SelectError; message: string };

const SEARCH_PROVIDER_IDS: readonly SearchProviderId[] = [
  "exa",
  "firecrawl",
  "tavily",
];

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// An absent or unrecognised provider header means EXA, the default backend.
// Falling back rather than erroring keeps a stale client from hard-failing.
function resolveSearchProvider(raw: string | null): SearchProviderId {
  const value = nonEmpty(raw)?.toLowerCase();
  const match = SEARCH_PROVIDER_IDS.find((id) => id === value);
  return match ?? "exa";
}

export function selectProvider(keys: Keys): SelectResult {
  const openrouterKey = nonEmpty(keys.openrouter);
  if (!openrouterKey) {
    return {
      ok: false,
      error: "missing_api_key",
      message:
        "Provide an OpenRouter key in /settings (or the x-openrouter-key header).",
    };
  }

  const searchKey = nonEmpty(keys.search);
  if (!searchKey) {
    return {
      ok: false,
      error: "missing_search_key",
      message:
        "A web-search key is required. No model can search the web on its own, so a report without one would be ungrounded. Add an EXA key in /settings (or the x-search-key header).",
    };
  }

  return {
    ok: true,
    config: {
      openrouterKey,
      searchKey,
      searchProvider: resolveSearchProvider(keys.searchProvider),
    },
  };
}
