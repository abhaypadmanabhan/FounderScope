// Provider abstraction types — section authors and route.ts depend on this surface.
import type { ZodType } from "zod";
import type { SearchProvider, SearchUsage } from "@/lib/search";

export type { SearchUsage } from "@/lib/search";

export type SearchProviderId = SearchProvider["id"];
export type ModelTier = "default" | "reasoning";

// Stable namespace for prompt cache keys across the project. Keep ASCII only
// and lower-case — providers that key their caches on string equality are
// unforgiving about anything else.
export const CACHE_KEY_PREFIX = "founderscope" as const;

// Raw BYOK material as it arrives from headers or env. Inference is
// OpenRouter-only; search is required, not optional — no model in the map has a
// native web-search tool, so a report without a search key would be ungrounded.
export interface Keys {
  openrouter: string | null;
  search: string | null;
  searchProvider: string | null;
}

export interface ProviderConfig {
  openrouterKey: string;
  searchKey: string;
  searchProvider: SearchProviderId;
}

export interface RunArgs<T> {
  config: ProviderConfig;
  tier: ModelTier;
  prompt: string;
  schema: ZodType<T>;
  /**
   * "search" (default) gives the model the web_search tool. "none" runs a
   * single-shot call with no tools at all — no tool loop, no step budget to
   * exhaust. Used as a second attempt for disambiguation, where the model's
   * own knowledge of a well-known company beats returning nothing.
   */
  tools?: "search" | "none";
  /**
   * Stable prompt cache key.
   * Format: "founderscope:section:<sectionKey>" or "founderscope:disambiguate".
   */
  cacheKey?: string;
}

export interface RunResult<T> {
  data: T;
  raw: string;
  modelVersion: string;
  /**
   * Per-call search usage counters, produced by the search policy wrapper.
   * route.ts aggregates these into a request-level `exa_usage` SSE event.
   */
  usage?: SearchUsage;
}
