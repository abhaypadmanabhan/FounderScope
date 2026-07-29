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
 * call now contains every round trip, every web search and the final output
 * step, so a flat 60s abort around it killed any section that searched more
 * than once or twice. `timeout.stepMs` restores the per-turn meaning — the SDK
 * arms a fresh step timer on each iteration of its loop.
 */
const FAST_STEP_TIMEOUT_MS = 60_000;

/**
 * The reasoning tier gets four times as long per step, because one structural
 * difference between the tiers makes a single step legitimately slower: a
 * thinking phase. `deepseek-v4-pro` runs with `reasoning.effort: "medium"` and
 * a 16k output ceiling, so one step is thinking tokens plus a long section
 * body — a few thousand tokens, which at the 20-60 tok/s a large hosted model
 * typically sustains is 100-300 seconds. The sixth live run proved the lower
 * bound the hard way: moat died on `Step timeout of 60000ms exceeded` while
 * every default-tier section passed on the same 60s.
 *
 * 240s sits above that band with room for provider queueing, and is still a
 * useful signal rather than a blanket increase: a step past four minutes is
 * wedged, not thinking. It is deliberately scaled to the one thing that
 * differs, not raised for both tiers.
 */
const REASONING_STEP_TIMEOUT_MS = 240_000;

export function stepTimeoutMsFor(tier: ModelTier): number {
  return tier === "reasoning"
    ? REASONING_STEP_TIMEOUT_MS
    : FAST_STEP_TIMEOUT_MS;
}

/**
 * How many steps in a loop may plausibly be slow ones.
 *
 * A reasoning section does not think on every step: most steps are a tool call
 * and a short turn around a search result, which run at fast-tier speed. The
 * thinking happens when it plans and when it writes the final body. Two is that
 * shape with a little room.
 */
const SLOW_STEP_ALLOWANCE = 2;

/**
 * Ceiling for the whole loop — a backstop against a wedged run, not a target.
 * Summing the per-step ceiling across every step would give the reasoning tier
 * 56 minutes, which is not a backstop, it is an abandonment. Instead: allow a
 * couple of genuinely slow steps at that tier's ceiling and price the rest at
 * fast-tier speed.
 *
 * For the default tier both constants are 60s, so this reduces exactly to the
 * previous `stepBudget × 60s` — 12 minutes, the old adapter's effective
 * MAX_TURNS × per-turn ceiling, unchanged. The reasoning tier lands on 20
 * minutes.
 */
export function totalTimeoutMsFor(tier: ModelTier): number {
  const slow = Math.min(SLOW_STEP_ALLOWANCE, stepBudgetFor(tier));
  const fast = stepBudgetFor(tier) - slow;
  return slow * stepTimeoutMsFor(tier) + fast * FAST_STEP_TIMEOUT_MS;
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
  "num_results is optional: how many hits to return, 1-10, default 5. " +
  "Budget: aim for 3-5 searches per task. Quality matters more than quantity. " +
  "After gathering enough information, stop searching and write the final JSON answer.";

/**
 * Deliberately forgiving, because a tool call that fails *validation* never
 * reaches `execute` — the SDK hands the model an opaque error and the model
 * spends a step retrying. The callback's try/catch cannot save it; the only
 * defence is a schema that accepts what models actually emit.
 *
 * A model sending `num_results: "3"` (a JSON string, common when tool
 * arguments are serialised) was rejected outright by the previous
 * `z.number().int().min(1).max(10)`. Now anything unusable degrades to
 * `undefined` and the callback falls back to the default, and out-of-range
 * values are clamped in `runSearchTool` rather than refused. The advertised
 * range moved into the description, where it guides without gating.
 */
export const SEARCH_TOOL_INPUT_SCHEMA = z.object({
  query: z.coerce.string(),
  num_results: z.coerce.number().int().optional().catch(undefined),
});

const MIN_RESULTS = 1;
const MAX_RESULTS = 10;

/**
 * Steps the SDK is allowed before it gives up.
 *
 * b1 used budget + 2, reasoned from a best case: 8 search steps, one
 * budget-exhausted call, one output step — exactly 10, with no slack at all.
 * The third live run then lost four default-tier sections to
 * "ran out of steps after 10 of 10 (finishReason=tool-calls)", which is what
 * a zero-slack ceiling looks like when anything costs an extra turn:
 *
 *   - a model that emits one tool call per step rather than batching them
 *     spends the entire search budget on steps, one for one;
 *   - a failed search still consumes budget, so a bad run reaches the cap
 *     without ever returning a result;
 *   - a second budget-exhausted call, or one turn of prose between searches,
 *     is enough on its own to push the output step past the ceiling.
 *
 * Budget + 4 costs nothing when the model converges early — `stopWhen` is a
 * ceiling, not a target, and a section that searches four times and answers
 * still takes five steps. It only spends more when the alternative was losing
 * the section entirely.
 */
export function stepBudgetFor(tier: ModelTier): number {
  return SEARCH_BUDGET[tier] + 4;
}

export async function runOpenRouter<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  return withRetry(() => doCall(args));
}

async function doCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const { config, tier, prompt, schema } = args;
  const withTools = (args.tools ?? "search") === "search";
  const modelId = modelFor(tier);
  const usage: SearchUsage = createSearchUsage();
  const budget = createSearchBudget(tier);
  const searchProvider = createSearchProvider(
    config.searchProvider,
    config.searchKey,
  );

  const openrouter = createOpenRouter({ apiKey: config.openrouterKey });
  const stepBudget = stepBudgetFor(tier);
  const trace: ToolTrace = { attempts: 0, failures: 0, errors: [] };

  try {
    const result = await generateText({
      model: openrouter(modelId),
      prompt,
      // No tools means no tool loop and no step budget to exhaust: the model
      // answers from what it already knows, in one step.
      ...(withTools
        ? {
            tools: {
              [SEARCH_TOOL_NAME]: tool({
                description: SEARCH_TOOL_DESCRIPTION,
                inputSchema: SEARCH_TOOL_INPUT_SCHEMA,
                execute: async ({ query, num_results }) =>
                  runSearchTool(
                    searchProvider,
                    query,
                    num_results,
                    budget,
                    usage,
                    trace,
                  ),
              }),
            },
          }
        : {}),
      // Output.object ONLY when no tools are offered.
      //
      // It sets responseFormat to a strict json_schema, and the SDK attaches
      // that to EVERY step of the loop (ai/dist/index.mjs:4738), including the
      // step where tools are offered. A model under a strict response format
      // has one legal move — emit an object matching the schema — so it cannot
      // emit a tool call. gemini-3.1-flash-lite complies immediately and
      // returns a schema-valid object with empty arrays, which is what six
      // default-tier sections did on the fifth live run: no error, no timeout,
      // no step exhaustion, no searches, nothing in `claims`.
      //
      // With tools we let the model talk, and parse its JSON from the text.
      // That is what every section prompt was written for — they all carry a
      // "JSON SCHEMA:" block, an "EXAMPLE OUTPUT" block, and "Output ONE valid
      // JSON object ... No prose. No markdown. No code fences." — and
      // parseModelJson already recovers fenced and wrapped variants.
      ...(withTools ? {} : { output: Output.object({ schema }) }),
      stopWhen: stepCountIs(withTools ? stepBudget : 2),
      maxOutputTokens: maxOutputTokensFor(tier),
      // Per-step and overall, never one flat abort around the whole loop.
      timeout: {
        stepMs: stepTimeoutMsFor(tier),
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
    const data = withTools
      ? parseToolLoopOutput(result, text, schema, stepBudget, trace)
      : readOutput(result, text, schema, stepBudget, trace);
    return {
      data: assertPopulated(data),
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
        data: assertPopulated(salvaged),
        raw: err.text,
        modelVersion: err.response?.modelId ?? modelId,
        usage,
      };
    }
    // generateText can reject with this instead of surfacing it on the getter.
    // Same failure, same explanation — otherwise it reads as an internal fault.
    if (NoOutputGeneratedError.isInstance(err)) {
      throw noOutputError(0, stepBudget, undefined, trace);
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
/**
 * A section whose `claims` array is empty has no grounded content: no cited
 * fact, nothing for the citation validator to check, nothing on the page. It
 * passes Zod because the schema allows an empty array, and the third live run
 * counted two such sections as successes. They are not. Fail loudly so the
 * section reports `section_failed` rather than rendering blank.
 *
 * Only fires when the schema actually has `claims` — disambiguation and any
 * future claim-less output are untouched.
 */
export function assertPopulated<T>(data: T): T {
  const claims = (data as { claims?: unknown })?.claims;
  if (Array.isArray(claims) && claims.length === 0) {
    throw new ResearchError(
      "model_error",
      "Section returned zero claims. A schema-valid but empty section is not a result — " +
        "the model answered without grounding anything.",
      {},
    );
  }
  return data;
}

/**
 * The one failure the live runs kept producing, explained. Raised from both
 * places the SDK can signal it: the `output` getter on a returned result, and
 * `generateText` itself rejecting.
 */
function noOutputError(
  stepsUsed: number,
  stepBudget: number,
  finishReason: string | undefined,
  trace: ToolTrace,
): ResearchError {
  const steps =
    stepsUsed > 0
      ? `after ${stepsUsed} of ${stepBudget} allowed steps `
      : `after an unknown number of ${stepBudget} allowed steps `;
  return new ResearchError(
    "model_error",
    `Model emitted no final JSON object: the tool loop ended ${steps}` +
      `(finishReason=${finishReason ?? "unknown"}) and left no text to recover from. ` +
      (stepsUsed >= stepBudget
        ? "It ran out of steps."
        : "It stopped early without answering.") +
      // Without this, "ran out of steps" is ambiguous between a model that
      // searched productively and one that spent every step on a failing tool
      // call. Those need opposite fixes.
      ` ${describeTrace(trace)}`,
    {},
  );
}

/**
 * Per-call record of how the search tool actually behaved.
 *
 * `errors` keeps every DISTINCT failure in the order first seen. Reporting only
 * the last one is what let an EXA 401 on every single call read as "budget
 * exhausted" — the final failure was the budget guard, and the 401 that caused
 * all of them had been overwritten eight times. The first error is the cause;
 * the last is usually a consequence.
 */
interface ToolTrace {
  attempts: number;
  failures: number;
  errors: string[];
}

function recordFailure(trace: ToolTrace, message: string): void {
  trace.failures++;
  if (!trace.errors.includes(message)) trace.errors.push(message);
}

function describeTrace(trace: ToolTrace): string {
  if (trace.attempts === 0) return "The model never called web_search.";
  if (trace.failures === 0) {
    return `web_search ran ${trace.attempts} time(s), all successful.`;
  }
  const first = trace.errors[0] ?? "unknown";
  const rest = trace.errors.slice(1);
  return (
    `web_search ran ${trace.attempts} time(s), ${trace.failures} failed. ` +
    `First search error: ${first}.` +
    (rest.length > 0 ? ` Also seen: ${rest.join("; ")}.` : "")
  );
}

/**
 * The tool-loop path's answer: the model's own text, parsed and validated.
 * `parseModelJson` strips fences, unwraps a single-key or array wrapper, and
 * raises a ResearchError describing what the model actually did — the same
 * recovery the hand-rolled adapters had, and the reason dropping Output.object
 * here costs nothing.
 */
function parseToolLoopOutput<T>(
  result: ResultLike,
  text: string,
  schema: RunArgs<T>["schema"],
  stepBudget: number,
  trace: ToolTrace,
): T {
  if (text.trim().length === 0) {
    throw noOutputError(
      result.steps?.length ?? 0,
      stepBudget,
      result.finishReason,
      trace,
    );
  }
  return parseModelJson(text, schema, "openrouter");
}

function readOutput<T>(
  result: ResultLike & { output?: unknown },
  text: string,
  schema: RunArgs<T>["schema"],
  stepBudget: number,
  trace: ToolTrace,
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

    throw noOutputError(
      result.steps?.length ?? 0,
      stepBudget,
      result.finishReason,
      trace,
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
  trace: ToolTrace,
): Promise<string> {
  trace.attempts++;
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    recordFailure(trace, "empty query");
    return JSON.stringify({
      error: "empty query",
      message: "Call web_search again with a non-empty query string.",
      results: [],
    });
  }

  try {
    const results = await provider.search(trimmedQuery, {
      numResults: clampResults(numResults),
      budget,
      usage,
    });
    // Every section prompt was tuned against an object with a `results` key.
    // A bare array is a different contract.
    return JSON.stringify({ results });
  } catch (err) {
    recordFailure(trace, (err as Error)?.message ?? String(err));
    if (err instanceof SearchBudgetExhaustedError) {
      // The model-facing text is composed here, not in the search layer: this
      // module owns SEARCH_TOOL_NAME, and the search layer has no idea what the
      // tool is called. Naming it there is how a rename left the model being
      // told to stop calling a tool that no longer existed.
      return JSON.stringify({
        error: `${SEARCH_TOOL_NAME} budget exhausted`,
        message: `${err.instruction} Do not call ${SEARCH_TOOL_NAME} again.`,
        results: [],
      });
    }
    // Anything else — a provider outage, a misconfigured policy, a TypeError
    // from a future refactor — becomes a readable blob rather than an opaque
    // rejection. On the second live run every section that failed did so by
    // burning its whole step budget retrying failed tool calls, so this branch
    // is the difference between one wasted step and all of them.
    if (isDev) {
      console.error("[openrouter] web_search failed", err);
    }
    return JSON.stringify({
      error: (err as Error)?.message ?? "search call failed",
      results: [],
    });
  }
}

// Out-of-range is the model guessing, not the model failing. Clamp rather than
// refuse: a rejected call costs a step and returns nothing.
function clampResults(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_RESULTS, Math.max(MIN_RESULTS, Math.round(value)));
}

function mapSdkError(err: unknown, modelId: string): ResearchError {
  if (err instanceof ResearchError) return err;

  const name = (err as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    // The SDK's own message names which clock ran out ("Step timeout of
    // 60000ms exceeded" vs "Total timeout of ..."), which is the difference
    // between one slow round trip and a loop that never converged.
    const detail = (err as Error)?.message ?? "";
    // A total timeout means the loop never converged; repeating it costs a
    // second full search budget and token spend to most likely fail the same
    // way. A step timeout is one slow round trip and is worth another go.
    const isTotalTimeout = detail.includes("Total timeout");
    return new ResearchError(
      "timeout",
      detail
        ? `OpenRouter call aborted: ${detail}`
        : `OpenRouter call aborted before finishing`,
      { cause: err, retryable: isTotalTimeout ? false : undefined },
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
