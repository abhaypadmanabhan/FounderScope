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

/** Strip code fences and trim leading/trailing non-JSON characters. */
export function extractJson(text: string): string {
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const firstBrace = s.search(/[\{\[]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace > -1 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);
  return s;
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

  try {
    const data = schema.parse(parsed);
    return { data, raw: finalText, modelVersion: response.model };
  } catch (err) {
    if (err instanceof ZodError) {
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
