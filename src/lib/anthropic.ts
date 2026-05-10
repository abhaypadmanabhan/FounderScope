// Compat shim. Adapts the legacy signature used by sections + route.ts to the
// new src/lib/llm surface. Phase 2 deletes this and updates callers directly.
import type { ZodType } from "zod";
import { runResearchCall as runNew } from "./llm";
import type { ModelTier, ProviderConfig } from "./llm";
import type { WebSearchToolVersion } from "./sections/types";

export { ResearchError } from "./llm";
export type { ResearchErrorCategory } from "./llm";

interface LegacyArgs<T> {
  apiKey: string;
  model: string;
  webSearchVersion: WebSearchToolVersion;
  prompt: string;
  schema: ZodType<T>;
}

export async function runResearchCall<T>(
  args: LegacyArgs<T>,
): Promise<{ data: T; raw: string; modelVersion: string }> {
  const tier: ModelTier =
    args.model === "claude-opus-4-7" ? "reasoning" : "default";
  const config: ProviderConfig = {
    provider: "anthropic",
    searchBackend: "native",
    llmKey: args.apiKey,
    exaKey: null,
  };
  return runNew({
    config,
    tier,
    prompt: args.prompt,
    schema: args.schema,
  });
}
