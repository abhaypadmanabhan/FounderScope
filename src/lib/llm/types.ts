// Provider abstraction types — section authors and route.ts depend on this surface.
import type { ZodType } from "zod";
import type { ExaUsage } from "./tools/exa-search";

export type { ExaUsage } from "./tools/exa-search";

export type ProviderId = "anthropic" | "kimi";
export type SearchBackend = "native" | "exa";
export type ModelTier = "default" | "reasoning";

// Stable namespace for prompt_cache_key values across the project. Keep ASCII
// only and lower-case — Moonshot stores cache_key on a string-equality basis.
export const CACHE_KEY_PREFIX = "founderscope" as const;

// Per-section EXA budget. Hard cap regardless of provider — protects
// monthly EXA quota and forces model to converge instead of search-forever.
export const EXA_BUDGET: Record<ModelTier, number> = {
  default: 8,
  reasoning: 10,
} as const;

export interface Keys {
  anthropic: string | null;
  kimi: string | null;
  exa: string | null;
}

export interface ProviderConfig {
  provider: ProviderId;
  searchBackend: SearchBackend;
  llmKey: string;
  exaKey: string | null;
}

export interface RunArgs<T> {
  config: ProviderConfig;
  tier: ModelTier;
  prompt: string;
  schema: ZodType<T>;
  /**
   * Stable Moonshot prompt_cache_key. Anthropic adapter currently ignores this.
   * Format: "founderscope:section:<sectionKey>" or "founderscope:disambiguate".
   */
  cacheKey?: string;
}

export interface RunResult<T> {
  data: T;
  raw: string;
  modelVersion: string;
  /**
   * Per-call Exa usage counters. Omitted when the adapter never invoked Exa
   * (e.g. Anthropic with native web_search). route.ts aggregates these into
   * a request-level total for the final `exa_usage` SSE event.
   */
  usage?: ExaUsage;
}
