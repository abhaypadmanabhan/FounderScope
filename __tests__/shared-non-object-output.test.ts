// Regression: a model that returns a top-level JSON *string* (a bare quoted
// sentence — refusal, "no data found", or its whole answer wrapped in quotes)
// used to surface as a cryptic Zod "expected object, received string". The
// parse layer must instead fail loudly with a model_error that shows what the
// model actually said.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseFinal } from "@/lib/llm/shared";
import { ResearchError } from "@/lib/llm/errors";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

const schema = z.object({ canonical_name: z.string() });

function msg(text: string): BetaMessage {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    model: "claude-haiku-4-5",
  } as unknown as BetaMessage;
}

describe("parseFinal — non-object top-level model output", () => {
  it("bare quoted sentence → model_error surfacing the text (not a Zod error)", () => {
    try {
      parseFinal(msg('"I could not find reliable information."'), schema, "claude-haiku-4-5", "anthropic");
      throw new Error("expected parseFinal to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchError);
      const re = err as ResearchError;
      expect(re.category).toBe("model_error");
      expect(re.message).toContain("could not find reliable information");
      expect(re.message).not.toContain("Zod");
    }
  });

  it("fenced quoted string → model_error", () => {
    try {
      parseFinal(msg('```json\n"no data"\n```'), schema, "claude-haiku-4-5", "anthropic");
      throw new Error("expected parseFinal to throw");
    } catch (err) {
      expect((err as ResearchError).category).toBe("model_error");
    }
  });

  it("normal JSON object → still works", () => {
    const result = parseFinal(msg('{"canonical_name":"Anthropic"}'), schema, "claude-haiku-4-5", "anthropic");
    expect(result.data).toEqual({ canonical_name: "Anthropic" });
  });
});
