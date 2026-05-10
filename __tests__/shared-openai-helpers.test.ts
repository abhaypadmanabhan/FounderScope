import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseFinalOpenAI,
  mapOpenAIError,
} from "@/lib/llm/shared";
import { ResearchError } from "@/lib/llm/errors";

const SimpleSchema = z.object({ ok: z.boolean() });

function makeChatCompletion(content: string, model = "kimi-k2.6") {
  return {
    id: "chatcmpl-test",
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop" as const,
        message: { role: "assistant" as const, content },
      },
    ],
  };
}

describe("parseFinalOpenAI", () => {
  it("parses pure JSON when strict json_schema returns clean output", () => {
    const resp = makeChatCompletion('{"ok":true}');
    const result = parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
    expect(result.data).toEqual({ ok: true });
    expect(result.modelVersion).toBe("kimi-k2.6");
    expect(result.raw).toBe('{"ok":true}');
  });

  it("falls back to extractJson when content has accidental fencing", () => {
    const resp = makeChatCompletion('```json\n{"ok":true}\n```');
    const result = parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
    expect(result.data).toEqual({ ok: true });
  });

  it("throws model_error when content is empty", () => {
    const resp = makeChatCompletion("");
    try {
      parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchError);
      expect((err as ResearchError).category).toBe("model_error");
    }
  });

  it("throws schema_validation when JSON parses but Zod rejects", () => {
    const resp = makeChatCompletion('{"ok":"not-a-bool"}');
    try {
      parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchError);
      expect((err as ResearchError).category).toBe("schema_validation");
    }
  });
});

describe("mapOpenAIError", () => {
  it("maps AbortError name → timeout", () => {
    const err: { name: string } = { name: "AbortError" };
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("timeout");
    expect(mapped.message).toMatch(/Kimi call timed out after 120000ms/);
  });

  it("maps 401 → auth_error", () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("auth_error");
    expect(mapped.message).toMatch(/Invalid Kimi API key/);
  });

  it("maps 429 → rate_limit", () => {
    const err = Object.assign(new Error("Slow down"), { status: 429 });
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("rate_limit");
  });

  it("maps generic OpenAI APIError-shaped error → model_error", () => {
    const err = Object.assign(new Error("boom"), { status: 500 });
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("model_error");
  });

  it("maps non-Error → model_error with stringified value", () => {
    const mapped = mapOpenAIError("strange string thrown", "Kimi", 120_000);
    expect(mapped.category).toBe("model_error");
    expect(mapped.message).toMatch(/Unexpected Kimi error/);
  });
});
