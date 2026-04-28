// Anthropic SDK wrapper: per-call web_search tool version + conditional dynamic-filtering beta.
import Anthropic from "@anthropic-ai/sdk";
import {
  AuthenticationError,
  RateLimitError,
  APIError,
  APIUserAbortError,
} from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaContentBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { REASONING_MODEL, type WebSearchToolVersion } from "./sections/types";

export type ResearchErrorCategory =
  | "schema_validation"
  | "model_error"
  | "auth_error"
  | "rate_limit"
  | "timeout";

export class ResearchError extends Error {
  category: ResearchErrorCategory;
  raw?: string;
  cause?: unknown;
  constructor(category: ResearchErrorCategory, message: string, opts?: { raw?: string; cause?: unknown }) {
    super(message);
    this.name = "ResearchError";
    this.category = category;
    this.raw = opts?.raw;
    this.cause = opts?.cause;
  }
}

const TIMEOUT_MS = 60_000;
const DYNAMIC_FILTERING_BETA = "code-execution-web-tools-2026-02-09";
const isDev = process.env.NODE_ENV !== "production";

type RunArgs<T> = {
  apiKey: string;
  model: string;
  webSearchVersion: WebSearchToolVersion;
  prompt: string;
  schema: ZodType<T>;
};

export async function runResearchCall<T>(
  args: RunArgs<T>
): Promise<{ data: T; raw: string; modelVersion: string }> {
  return withRetry(() => doCall(args));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [2_000, 8_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ResearchError)) throw err;
      if (err.category !== "rate_limit" && err.category !== "timeout") throw err;
      if (attempt === delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

function maxTokensFor(model: string): number {
  return model === REASONING_MODEL ? 16384 : 8192;
}

async function doCall<T>(args: RunArgs<T>): Promise<{ data: T; raw: string; modelVersion: string }> {
  const { apiKey, model, webSearchVersion, prompt, schema } = args;
  const maxTokens = maxTokensFor(model);
  const useBeta = webSearchVersion === "web_search_20260209";

  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = [
    { type: webSearchVersion, name: "web_search", max_uses: 8 },
    { type: "code_execution_20250522", name: "code_execution" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: prompt },
  ];
  const baseArgs: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    tools,
    messages,
    ...(useBeta ? { betas: [DYNAMIC_FILTERING_BETA] } : {}),
  };

  // eslint-disable-next-line prefer-const
  let response!: BetaMessage;
  let safety = 0;
  const MAX_TURNS = 12;

  try {
    while (true) {
      safety++;
      if (safety > MAX_TURNS) {
        throw new ResearchError("model_error", "exceeded max tool turns", {});
      }

      try {
        response = await client.beta.messages.create(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          baseArgs as any,
          { signal: controller.signal }
        );
      } catch (err) {
        if (err instanceof APIUserAbortError || (err as { name?: string })?.name === "AbortError") {
          throw new ResearchError("timeout", `Anthropic call timed out after ${TIMEOUT_MS}ms`, { cause: err });
        }
        if (err instanceof AuthenticationError) {
          throw new ResearchError("auth_error", "Invalid Anthropic API key", { cause: err });
        }
        if (err instanceof RateLimitError) {
          throw new ResearchError("rate_limit", "Anthropic rate limit hit", { cause: err });
        }
        if (err instanceof APIError) {
          throw new ResearchError("model_error", `Anthropic API error: ${(err as Error).message}`, { cause: err });
        }
        throw new ResearchError("model_error", `Unexpected Anthropic error: ${(err as Error)?.message ?? String(err)}`, {
          cause: err,
        });
      }

      if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
        break;
      }

      if (response.stop_reason === "tool_use") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unknownToolUse = response.content?.find((b: any) =>
          b.type === "tool_use" &&
          b.name !== "web_search" &&
          b.name !== "code_execution"
        );
        if (unknownToolUse) {
          if (isDev) {
            console.error("[anthropic] model_error stop_reason=tool_use", {
              model,
              finalStopReason: response.stop_reason,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              contentBlockTypes: response.content?.map((b: any) => b.type),
              lastTextBlock: response.content
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?.filter((b: any) => b.type === "text")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?.map((b: any) => b.text?.slice(0, 400))
                ?.join("\n---\n"),
            });
          }
          throw new ResearchError(
            "model_error",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `unexpected client-side tool_use: ${(unknownToolUse as any).name}`,
            {}
          );
        }
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      // max_tokens, refusal, etc — break and let text-extraction handle it
      break;
    }
  } finally {
    clearTimeout(timer);
  }

  const finalText = (response.content ?? ([] as BetaContentBlock[]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text as string)
    .join("\n");

  if (!finalText.trim()) {
    if (isDev) {
      console.error("[anthropic] no text in final response", {
        model,
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
      console.error("[anthropic] JSON parse failed for model", response.model, "text length", cleaned.length);
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
        console.error("[anthropic] schema_validation failure", {
          model,
          rawTextFirstChars: finalText.slice(0, 800),
          rawTextLastChars: finalText.slice(-300),
          rawTextLength: finalText.length,
          zodIssues: err.issues.slice(0, 8),
        });
      }
      throw new ResearchError("schema_validation", `Zod schema validation failed: ${err.message}`, {
        raw: finalText,
        cause: err,
      });
    }
    throw err;
  }
}

function extractJson(text: string): string {
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const firstBrace = s.search(/[\{\[]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace > -1 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);
  return s;
}
