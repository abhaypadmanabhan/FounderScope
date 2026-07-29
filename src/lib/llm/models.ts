// Two-tier model map, routed through OpenRouter. Hardcoded for end users —
// spec D2 rules out user-facing model selection. The two env vars exist so the
// eval harness can sweep models and produce comparative benchmarks; nothing in
// the product UI sets them.
import type { ModelTier } from "./types";

export const MODEL_MAP: Readonly<Record<ModelTier, string>> = {
  default: "google/gemini-3.1-flash-lite",
  reasoning: "deepseek/deepseek-v4-pro",
};

const OVERRIDE_ENV: Readonly<Record<ModelTier, string>> = {
  default: "FS_MODEL_DEFAULT",
  reasoning: "FS_MODEL_REASONING",
};

export function modelFor(tier: ModelTier): string {
  const override = process.env[OVERRIDE_ENV[tier]];
  return override && override.trim().length > 0 ? override.trim() : MODEL_MAP[tier];
}

// Output ceiling per tier. Carried over from the Anthropic adapter unchanged:
// the reasoning tier writes the longest section (moat) and needs the headroom.
export function maxOutputTokensFor(tier: ModelTier): number {
  return tier === "reasoning" ? 16_384 : 8_192;
}
