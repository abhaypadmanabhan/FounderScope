// Provider abstraction types — section authors and route.ts depend on this surface.
import type { ZodType } from "zod";

export type ProviderId = "anthropic" | "kimi";
export type SearchBackend = "native" | "exa";
export type ModelTier = "default" | "reasoning";

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
}

export interface RunResult<T> {
  data: T;
  raw: string;
  modelVersion: string;
}
