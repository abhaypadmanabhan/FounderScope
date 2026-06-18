// Shared utilities for LLM adapters — extracted to avoid duplication between
// adapters/anthropic.ts and adapters/kimi.ts. Both adapters call these with
// a logPrefix ("anthropic" | "kimi") as the only behavioral differentiator.
import {
  AuthenticationError,
  RateLimitError,
  APIError,
  APIUserAbortError,
} from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import type { ZodType } from "zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ResearchError } from "./errors";
import type { RunResult } from "./types";

const isDev = process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------------------
// extractJson
// ---------------------------------------------------------------------------

/** Strip code fences and trim leading/trailing non-JSON characters.
 *
 * Handles:
 * - Plain JSON (no fences)
 * - Fenced JSON with prose preamble (model writes "Here is my answer:\n```json\n{...}\n```")
 * - Fenced JSON with prose after the fence (rare)
 * - Multiple fenced blocks — extracts the LAST one (likely the final answer, not an example)
 * - No fence with prose preamble — brace-trim fallback
 */
export function extractJson(text: string): string {
  let s = text.trim();

  // Find ALL code fence blocks (```) anywhere in the text.
  // We look for the LAST one because models often write preamble or
  // examples before the actual answer.
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let lastFenceContent: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(s)) !== null) {
    lastFenceContent = match[1].trim();
  }

  if (lastFenceContent !== null) {
    s = lastFenceContent;
  }

  // Brace-trim fallback: strip leading prose before first { or [
  // and trailing prose after last } or ]
  const firstBrace = s.search(/[\{\[]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace > -1 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);
  return s;
}

/**
 * Our section/disambiguation schemas are all `z.object(...)`, so the top-level
 * value MUST be an object. Models occasionally emit a bare quoted string
 * instead — a refusal, a "no data found" sentence, or their whole answer
 * wrapped in quotes. `JSON.parse` happily turns that into a JS string, and
 * `schema.parse(string)` then throws a cryptic "expected object, received
 * string" that hides what the model actually said. Catch it here and fail with
 * an actionable model_error that surfaces the model's text.
 */
function ensureJsonObject(parsed: unknown, raw: string, logPrefix: string): void {
  if (parsed !== null && typeof parsed === "object") return;

  const preview =
    typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed);
  if (isDev) {
    console.error(`[${logPrefix}] model returned non-object top-level value`, {
      type: parsed === null ? "null" : typeof parsed,
      preview,
    });
  }
  throw new ResearchError(
    "model_error",
    `Model returned a ${parsed === null ? "null" : typeof parsed}, not a JSON object: ${preview}`,
    { raw },
  );
}

/**
 * Last-resort recovery for valid JSON of the WRONG shape. Models sometimes wrap
 * the answer in an array (`[{...}]`) or under a single key (`{"result":{...}}`),
 * which fails the schema with "expected X, received undefined" on every field.
 * Try the obvious unwrappings, but accept a candidate ONLY if it actually
 * satisfies the schema — never guess past validation. Returns null if nothing
 * salvageable, so the caller surfaces the original schema error.
 */
function salvageShape<T>(parsed: unknown, schema: ZodType<T>): { data: T } | null {
  const candidates: unknown[] = [];
  if (Array.isArray(parsed) && parsed.length > 0) {
    candidates.push(parsed[0]);
  } else if (parsed !== null && typeof parsed === "object") {
    const values = Object.values(parsed as Record<string, unknown>);
    if (values.length === 1 && values[0] !== null && typeof values[0] === "object") {
      candidates.push(values[0]);
    }
  }
  for (const candidate of candidates) {
    const result = schema.safeParse(candidate);
    if (result.success) return { data: result.data };
  }
  return null;
}

// ---------------------------------------------------------------------------
// parseFinal
// ---------------------------------------------------------------------------

/**
 * Pull text blocks out of a BetaMessage, clean JSON, parse, validate with Zod.
 * @param logPrefix  "anthropic" | "kimi" — used in dev-only console.error calls.
 */
export function parseFinal<T>(
  response: BetaMessage,
  schema: ZodType<T>,
  resolvedModel: string,
  logPrefix: string,
): RunResult<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalText = (response.content ?? [] as any[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text as string)
    .join("\n");

  if (!finalText.trim()) {
    if (isDev) {
      console.error(`[${logPrefix}] no text in final response`, {
        model: resolvedModel,
        stop_reason: response.stop_reason,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contentBlockTypes: response.content?.map((b: any) => b.type),
      });
    }
    throw new ResearchError("model_error", "no text in final response", {});
  }

  const cleaned = extractJson(finalText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    if (isDev) {
      console.error(
        `[${logPrefix}] JSON parse failed for model`,
        resolvedModel,
        "text length",
        cleaned.length,
      );
    }
    throw new ResearchError("schema_validation", "Model output is not valid JSON", {
      raw: finalText,
      cause: err,
    });
  }

  ensureJsonObject(parsed, finalText, logPrefix);

  try {
    const data = schema.parse(parsed);
    return { data, raw: finalText, modelVersion: response.model };
  } catch (err) {
    if (err instanceof ZodError) {
      const salvaged = salvageShape(parsed, schema);
      if (salvaged) {
        if (isDev) console.warn(`[${logPrefix}] salvaged wrapped JSON shape`);
        return { data: salvaged.data, raw: finalText, modelVersion: response.model };
      }
      if (isDev) {
        console.error(`[${logPrefix}] schema_validation failure`, {
          model: resolvedModel,
          rawTextFirstChars: finalText.slice(0, 800),
          rawTextLastChars: finalText.slice(-300),
          rawTextLength: finalText.length,
          zodIssues: err.issues.slice(0, 8),
        });
      }
      throw new ResearchError(
        "schema_validation",
        `Zod schema validation failed: ${err.message}`,
        { raw: finalText, cause: err },
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// mapSdkError
// ---------------------------------------------------------------------------

/**
 * Map Anthropic SDK errors (used by both Anthropic and Moonshot endpoints)
 * to ResearchError categories.
 * @param logPrefix     "Anthropic" | "Kimi" — used in error messages.
 * @param timeoutMs     The timeout value configured for the caller (used in message).
 */
export function mapSdkError(
  err: unknown,
  logPrefix: string,
  timeoutMs: number,
): ResearchError {
  if (
    err instanceof APIUserAbortError ||
    (err as { name?: string })?.name === "AbortError"
  ) {
    return new ResearchError(
      "timeout",
      `${logPrefix} call timed out after ${timeoutMs}ms`,
      { cause: err },
    );
  }
  if (err instanceof AuthenticationError) {
    return new ResearchError("auth_error", `Invalid ${logPrefix} API key`, { cause: err });
  }
  if (err instanceof RateLimitError) {
    return new ResearchError("rate_limit", `${logPrefix} rate limit hit`, { cause: err });
  }
  if (err instanceof APIError) {
    return new ResearchError(
      "model_error",
      `${logPrefix} API error: ${(err as Error).message}`,
      { cause: err },
    );
  }
  return new ResearchError(
    "model_error",
    `Unexpected ${logPrefix} error: ${(err as Error)?.message ?? String(err)}`,
    { cause: err },
  );
}

// ---------------------------------------------------------------------------
// OpenAI-compat helpers (Kimi via api.moonshot.ai/v1)
// ---------------------------------------------------------------------------

/**
 * Minimal shape of an OpenAI-compat ChatCompletion the Kimi adapter needs.
 * We avoid importing the `openai` types here so this file stays SDK-agnostic
 * for tests that don't pull the SDK in.
 */
export interface OpenAIChatCompletionLike {
  id?: string;
  model?: string;
  choices: Array<{
    index?: number;
    finish_reason?: string;
    message: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cached_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
}

/**
 * Parse the final assistant message of an OpenAI-compat completion. Strict
 * json_schema mode SHOULD make `JSON.parse(content)` succeed; we still run
 * `extractJson` as a guard, then validate with Zod (matches `parseFinal`'s
 * contract for the Anthropic path).
 */
export function parseFinalOpenAI<T>(
  response: OpenAIChatCompletionLike,
  schema: ZodType<T>,
  resolvedModel: string,
  logPrefix: string,
): RunResult<T> {
  const content = response.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    if (isDev) {
      console.error(`[${logPrefix}] no content in final response`, {
        model: resolvedModel,
        finish_reason: response.choices?.[0]?.finish_reason,
      });
    }
    throw new ResearchError("model_error", "no content in final response", {});
  }

  // Strict json_schema mode SHOULD make this branch take the fast path.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Defensive fallback: model accidentally fenced or prose-prefixed the
    // output despite strict mode. Reuse extractJson for one retry before
    // we surface a schema_validation failure.
    const cleaned = extractJson(content);
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      if (isDev) {
        console.error(
          `[${logPrefix}] JSON parse failed (strict mode) for model`,
          resolvedModel,
          "text length",
          content.length,
        );
      }
      throw new ResearchError("schema_validation", "Model output is not valid JSON", {
        raw: content,
        cause: err,
      });
    }
  }

  ensureJsonObject(parsed, content, logPrefix);

  try {
    const data = schema.parse(parsed);
    return { data, raw: content, modelVersion: response.model ?? resolvedModel };
  } catch (err) {
    if (err instanceof ZodError) {
      const salvaged = salvageShape(parsed, schema);
      if (salvaged) {
        if (isDev) console.warn(`[${logPrefix}] salvaged wrapped JSON shape (openai)`);
        return { data: salvaged.data, raw: content, modelVersion: response.model ?? resolvedModel };
      }
      if (isDev) {
        console.error(`[${logPrefix}] schema_validation failure (openai)`, {
          model: resolvedModel,
          rawTextFirstChars: content.slice(0, 800),
          rawTextLastChars: content.slice(-300),
          rawTextLength: content.length,
          zodIssues: err.issues.slice(0, 8),
        });
      }
      throw new ResearchError(
        "schema_validation",
        `Zod schema validation failed: ${err.message}`,
        { raw: content, cause: err },
      );
    }
    throw err;
  }
}

/**
 * Map errors from the `openai` SDK (used against Moonshot's OpenAI-compat
 * endpoint) to ResearchError categories. Mirrors `mapSdkError` for Anthropic.
 *
 * The `openai` SDK throws subclasses of `OpenAI.APIError` with a numeric
 * `.status` field. Auth/RateLimit/Abort have dedicated subclasses, but we
 * pattern-match on shape rather than instanceof so this stays mockable.
 */
export function mapOpenAIError(
  err: unknown,
  logPrefix: string,
  timeoutMs: number,
): ResearchError {
  const e = err as { name?: string; status?: number; message?: string } | undefined;
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") {
    return new ResearchError(
      "timeout",
      `${logPrefix} call timed out after ${timeoutMs}ms`,
      { cause: err },
    );
  }
  if (e?.status === 401) {
    return new ResearchError("auth_error", `Invalid ${logPrefix} API key`, { cause: err });
  }
  if (e?.status === 429) {
    return new ResearchError("rate_limit", `${logPrefix} rate limit hit`, { cause: err });
  }
  if (typeof e?.status === "number") {
    return new ResearchError(
      "model_error",
      `${logPrefix} API error (${e.status}): ${e.message ?? ""}`,
      { cause: err },
    );
  }
  return new ResearchError(
    "model_error",
    `Unexpected ${logPrefix} error: ${(err as Error)?.message ?? String(err)}`,
    { cause: err },
  );
}

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

const RETRY_DELAYS = [2_000, 8_000];

/**
 * Retry fn on rate_limit or timeout ResearchErrors with exponential delays.
 * Non-ResearchErrors and other categories are rethrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ResearchError)) throw err;
      if (err.category !== "rate_limit" && err.category !== "timeout") throw err;
      if (attempt === RETRY_DELAYS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw lastErr;
}
