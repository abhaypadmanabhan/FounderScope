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
  NoOutputGeneratedError,
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

/**
 * Per model round trip — one request/response with OpenRouter, not the whole
 * loop. This is what the old adapter's 60s meant: it wrapped a single
 * `messages.create` inside a `while` loop bounded by MAX_TURNS = 12.
 *
 * Moving to `generateText` inverted the scope without changing the number: one
 * call now contains every round trip, every web search and the final
 * structured-output step, so a flat 60s abort around it killed any section that
 * searched more than once or twice. The first live run lost 3 of 7 sections
 * exactly this way. `timeout.stepMs` restores the per-turn meaning — the SDK
 * arms a fresh step timer on each iteration of its loop.
 */
export const STEP_TIMEOUT_MS = 60_000;

/**
 * Ceiling for the whole loop, scaled to the steps the loop is allowed rather
 * than picked as a round number. Equivalent to the old effective ceiling of
 * MAX_TURNS × per-turn timeout: 10 min for the default tier, 12 for reasoning,
 * against the old 12 × 60s = 12 min. It is a backstop against a wedged run,
 * not a target — a healthy section finishes in well under a minute.
 */
export function totalTimeoutMsFor(tier: ModelTier): number {
  return stepBudgetFor(tier) * STEP_TIMEOUT_MS;
}

const isDev = process.env.NODE_ENV !== "production";

// `web_search`, because that is the name every prompt in the repo actually
// uses: src/lib/sections/shared.ts:122,126,141 and src/lib/disambiguate.ts:24,68
// all instruct the model to "use web_search". b1 registered it as `exa_search`
// on the assumption that the prompts named the EXA tool — they never did; that
// name only ever existed for the Anthropic adapter's client-side tool, while
// the prompts were written against Anthropic's native `web_search`.
//
// So for the whole first live run, all 8 calls were told to use a tool that did
// not exist. Renaming here fixes every prompt at once without editing a single
// file outside this module.
export const SEARCH_TOOL_NAME = "web_search";

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
  const stepBudget = stepBudgetFor(tier);

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
      stopWhen: stepCountIs(stepBudget),
      maxOutputTokens: maxOutputTokensFor(tier),
      // Per-step and overall, never one flat abort around the whole loop.
      timeout: {
        stepMs: STEP_TIMEOUT_MS,
        totalMs: totalTimeoutMsFor(tier),
      },
      ...(tier === "reasoning"
        ? {
            providerOptions: {
              openrouter: { reasoning: { enabled: true, effort: "medium" } },
            },
          }
        : {}),
    });

    const text = collectStepText(result);
    return {
      data: readOutput(result, text, schema, stepBudget),
      raw: text,
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
  }
}

/**
 * Everything the model said across the whole loop, not just the final step.
 * When the structured output never lands, this text is the only thing left to
 * recover a section from — a model that answers in prose on step 3 and then
 * stops has still done the work.
 */
interface StepLike {
  text?: string;
}

interface ResultLike {
  text?: string;
  steps?: readonly StepLike[];
  finishReason?: string;
}

function collectStepText(result: ResultLike): string {
  const parts = (result.steps ?? [])
    .map((step) => step.text ?? "")
    .filter((text) => text.trim().length > 0);
  if (parts.length > 0) return parts.join("\n");
  return result.text ?? "";
}

/**
 * `result.output` is a getter that throws NoOutputGeneratedError when the loop
 * ended without an object — which is what the first live run hit on `traction`,
 * surfacing as an unexplained "Unexpected OpenRouter error: No output
 * generated." The model running out of steps, or answering in prose instead of
 * calling the output tool, must not read like an internal fault: recover from
 * the text if there is any, and otherwise say exactly what happened.
 */
function readOutput<T>(
  result: ResultLike & { output?: unknown },
  text: string,
  schema: RunArgs<T>["schema"],
  stepBudget: number,
): T {
  try {
    return result.output as T;
  } catch (err) {
    if (!NoOutputGeneratedError.isInstance(err)) throw err;

    if (text.trim().length > 0) {
      if (isDev) {
        console.warn(
          "[openrouter] no structured output; recovering from step text",
        );
      }
      return parseModelJson(text, schema, "openrouter");
    }

    const stepsUsed = result.steps?.length ?? 0;
    throw new ResearchError(
      "model_error",
      `Model emitted no final JSON object: the tool loop ended after ${stepsUsed} of ${stepBudget} allowed steps ` +
        `(finishReason=${result.finishReason ?? "unknown"}) and left no text to recover from. ` +
        (stepsUsed >= stepBudget
          ? "It ran out of steps — raise the step budget or cut the search budget."
          : "It stopped early without answering."),
      {},
    );
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
    // The SDK's own message names which clock ran out ("Step timeout of
    // 60000ms exceeded" vs "Total timeout of ..."), which is the difference
    // between one slow round trip and a loop that never converged.
    const detail = (err as Error)?.message ?? "";
    return new ResearchError(
      "timeout",
      detail
        ? `OpenRouter call aborted: ${detail}`
        : `OpenRouter call aborted before finishing`,
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
