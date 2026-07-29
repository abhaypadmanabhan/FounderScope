// Text-recovery helpers for model output.
//
// The AI SDK's `Output.object` validates the structured result itself, so this
// is no longer the primary parse path — it is the salvage path. When the model
// fences its JSON, wraps it in an array, or nests it under a single key, the
// SDK raises NoObjectGeneratedError with the raw text attached, and
// `parseModelJson` gets one more shot at it before the section fails. That
// recovery is product behaviour, not adapter plumbing: it is the difference
// between a section returning content and returning nothing.
import { ZodError } from "zod";
import type { ZodType } from "zod";
import { ResearchError } from "./errors";

const isDev = process.env.NODE_ENV !== "production";

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

/**
 * Clean, parse and validate raw model text against a schema. Throws a
 * ResearchError describing what the model actually did — never a bare Zod
 * error, which hides the output.
 */
export function parseModelJson<T>(
  text: string,
  schema: ZodType<T>,
  logPrefix: string,
): T {
  if (!text.trim()) {
    throw new ResearchError("model_error", "no text in final response", {});
  }

  const cleaned = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    if (isDev) {
      console.error(
        `[${logPrefix}] JSON parse failed`,
        "text length",
        cleaned.length,
      );
    }
    throw new ResearchError("schema_validation", "Model output is not valid JSON", {
      raw: text,
      cause: err,
    });
  }

  ensureJsonObject(parsed, text, logPrefix);

  try {
    return schema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      const salvaged = salvageShape(parsed, schema);
      if (salvaged) {
        if (isDev) console.warn(`[${logPrefix}] salvaged wrapped JSON shape`);
        return salvaged.data;
      }
      if (isDev) {
        console.error(`[${logPrefix}] schema_validation failure`, {
          rawTextFirstChars: text.slice(0, 800),
          rawTextLastChars: text.slice(-300),
          rawTextLength: text.length,
          zodIssues: err.issues.slice(0, 8),
        });
      }
      throw new ResearchError(
        "schema_validation",
        `Zod schema validation failed: ${err.message}`,
        { raw: text, cause: err },
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

const RETRY_DELAYS = [2_000, 8_000];

/**
 * Retry fn on rate_limit or timeout ResearchErrors with exponential delays.
 * Non-ResearchErrors and other categories are rethrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  delays: number[] = RETRY_DELAYS,
): Promise<T> {
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
