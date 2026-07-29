// The single inference path. Every one of the eight calls per research run —
// disambiguation plus seven sections — goes through here: one OpenRouter key,
// one tool loop, one Zod-validated object out.
//
// The tool loop is the AI SDK's. Search policy (budget, cache, retry,
// source-fallback, usage counting) belongs to src/lib/search/policy.ts and is
// deliberately not re-implemented here — this file only turns what that layer
// throws into something the model can read.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  NoObjectGeneratedError,
  Output,
  generateText,
  stepCountIs,
  tool,
} from "ai";
import { z } from "zod";
import {
  SEARCH_BUDGET,
  SearchBudgetExhaustedError,
  createSearchBudget,
  createSearchProvider,
  createSearchUsage,
  type SearchUsage,
} from "@/lib/search";
import { ResearchError } from "./errors";
import { maxOutputTokensFor, modelFor } from "./models";
import { parseModelJson, withRetry } from "./shared";
import type { ModelTier, RunArgs, RunResult } from "./types";

const TIMEOUT_MS = 60_000;
const isDev = process.env.NODE_ENV !== "production";

// Kept as `exa_search` even though the backend is now swappable: every section
// prompt names this tool, and so does the budget-exhausted instruction the
// model reads. Renaming it is a prompt change, not a plumbing change.
export const SEARCH_TOOL_NAME = "exa_search";

const SEARCH_TOOL_DESCRIPTION =
  "Search the public web. Returns a list of {title, url, highlights} hits. " +
  "Use for company facts, founder bios, funding rounds, news. " +
  "When you cite a fact in your output's `claims`, use the URL from these results. " +
  "Budget: aim for 3-5 searches per task. Quality matters more than quantity. " +
  "After gathering enough information, stop searching and write the final JSON answer.";

/**
 * Steps the SDK is allowed before it gives up.
 *
 * Worst case for a tier: the model spends its whole search budget one call per
 * step (8 default / 10 reasoning), makes one more call that comes back
 * budget-exhausted, then needs a final step to emit the structured object.
 * Generating that object counts as its own step — set this too low and the run
 * ends with tool results and no JSON. Hence budget + 2.
 */
export function stepBudgetFor(tier: ModelTier): number {
  return SEARCH_BUDGET[tier] + 2;
}

export async function runOpenRouter<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  return withRetry(() => doCall(args));
}

async function doCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const { config, tier, prompt, schema } = args;
  const modelId = modelFor(tier);
  const usage: SearchUsage = createSearchUsage();
  const budget = createSearchBudget(tier);
  const searchProvider = createSearchProvider(
    config.searchProvider,
    config.searchKey,
  );

  const openrouter = createOpenRouter({ apiKey: config.openrouterKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const result = await generateText({
      model: openrouter(modelId),
      prompt,
      tools: {
        [SEARCH_TOOL_NAME]: tool({
          description: SEARCH_TOOL_DESCRIPTION,
          inputSchema: z.object({
            query: z.string(),
            num_results: z.number().int().min(1).max(10).optional(),
          }),
          execute: async ({ query, num_results }) =>
            runSearchTool(searchProvider, query, num_results, budget, usage),
        }),
      },
      // Structured output alongside tools: generateObject cannot do this.
      output: Output.object({ schema }),
      stopWhen: stepCountIs(stepBudgetFor(tier)),
      maxOutputTokens: maxOutputTokensFor(tier),
      abortSignal: controller.signal,
      ...(tier === "reasoning"
        ? {
            providerOptions: {
              openrouter: { reasoning: { enabled: true, effort: "medium" } },
            },
          }
        : {}),
    });

    return {
      data: result.output as T,
      raw: result.text,
      modelVersion: result.response?.modelId ?? modelId,
      usage,
    };
  } catch (err) {
    // The SDK could not produce a valid object, but it kept the text. Models
    // fence their JSON, wrap it in an array, or nest it under one key — all
    // recoverable, and all previously recovered by the hand-rolled parser.
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      const salvaged = parseModelJson(err.text, schema, "openrouter");
      return {
        data: salvaged,
        raw: err.text,
        modelVersion: err.response?.modelId ?? modelId,
        usage,
      };
    }
    throw mapSdkError(err, modelId);
  } finally {
    clearTimeout(timer);
  }
}

type ToolSearchProvider = ReturnType<typeof createSearchProvider>;

/**
 * Always resolves to a string the model can read. A search failure must never
 * reject: the model's recourse is to rephrase and try again, and an exception
 * here would throw away every result it had already gathered.
 */
async function runSearchTool(
  provider: ToolSearchProvider,
  query: string,
  numResults: number | undefined,
  budget: ReturnType<typeof createSearchBudget>,
  usage: SearchUsage,
): Promise<string> {
  try {
    const results = await provider.search(query, {
      numResults,
      budget,
      usage,
    });
    // Every section prompt was tuned against an object with a `results` key.
    // A bare array is a different contract.
    return JSON.stringify({ results });
  } catch (err) {
    if (err instanceof SearchBudgetExhaustedError) {
      return JSON.stringify({
        error: err.message,
        message: err.instruction,
        results: [],
      });
    }
    return JSON.stringify({
      error: (err as Error)?.message ?? "search call failed",
      results: [],
    });
  }
}

function mapSdkError(err: unknown, modelId: string): ResearchError {
  if (err instanceof ResearchError) return err;

  const name = (err as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return new ResearchError(
      "timeout",
      `OpenRouter call timed out after ${TIMEOUT_MS}ms`,
      { cause: err },
    );
  }

  if (APICallError.isInstance(err)) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new ResearchError("auth_error", "Invalid OpenRouter API key", {
        cause: err,
      });
    }
    if (err.statusCode === 429) {
      return new ResearchError("rate_limit", "OpenRouter rate limit hit", {
        cause: err,
      });
    }
    return new ResearchError(
      "model_error",
      `OpenRouter API error (${err.statusCode ?? "no status"}): ${err.message}`,
      { cause: err },
    );
  }

  if (isDev) {
    console.error("[openrouter] unmapped error", { model: modelId, err });
  }
  return new ResearchError(
    "model_error",
    `Unexpected OpenRouter error: ${(err as Error)?.message ?? String(err)}`,
    { cause: err },
  );
}
