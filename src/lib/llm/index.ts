// Public surface. Sections + route.ts import runResearchCall from here.
import type { RunArgs, RunResult } from "./types";
import { runOpenRouter } from "./openrouter";

export { selectProvider } from "./select";
export type { SelectError, SelectResult } from "./select";
export { ResearchError } from "./errors";
export type { ResearchErrorCategory } from "./errors";
export { MODEL_MAP, modelFor } from "./models";
export { SEARCH_TOOL_NAME, stepBudgetFor } from "./openrouter";
export type {
  ModelTier,
  Keys,
  ProviderConfig,
  SearchProviderId,
  RunArgs,
  RunResult,
  SearchUsage,
} from "./types";

// One provider, one path. The switch this replaced existed only to pick
// between two hand-rolled adapters.
export async function runResearchCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  return runOpenRouter(args);
}
