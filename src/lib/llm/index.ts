// Public surface. Sections + route.ts import runResearchCall from here.
import type { RunArgs, RunResult } from "./types";
import { runAnthropic } from "./adapters/anthropic";
import { runKimi } from "./adapters/kimi";

export { selectProvider } from "./provider";
export type { SelectError, SelectResult } from "./provider";
export { ResearchError } from "./errors";
export type { ResearchErrorCategory } from "./errors";
export type {
  ProviderId,
  SearchBackend,
  ModelTier,
  Keys,
  ProviderConfig,
  RunArgs,
  RunResult,
} from "./types";

export async function runResearchCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  switch (args.config.provider) {
    case "anthropic":
      return runAnthropic(args);
    case "kimi":
      return runKimi(args);
  }
}
