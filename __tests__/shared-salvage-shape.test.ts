// Models sometimes return a valid JSON object of the WRONG shape: the answer
// wrapped in an array ([{...}]) or under a single key ({"result":{...}}). That
// validated to "expected string, received undefined" for every field. The parse
// layer must salvage these common wrappers — but ONLY when the unwrapped value
// actually satisfies the schema, never blindly.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseFinal } from "@/lib/llm/shared";
import { ResearchError } from "@/lib/llm/errors";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

const schema = z.object({ canonical_name: z.string(), canonical_domain: z.string() });
const good = { canonical_name: "Anthropic", canonical_domain: "anthropic.com" };

function msg(text: string): BetaMessage {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    model: "claude-haiku-4-5",
  } as unknown as BetaMessage;
}

describe("parseFinal — salvage wrapped shapes", () => {
  it("array-wrapped single object → unwrapped and validated", () => {
    const r = parseFinal(msg(JSON.stringify([good])), schema, "claude-haiku-4-5", "anthropic");
    expect(r.data).toEqual(good);
  });

  it("single-key wrapper object → unwrapped and validated", () => {
    const r = parseFinal(msg(JSON.stringify({ result: good })), schema, "claude-haiku-4-5", "anthropic");
    expect(r.data).toEqual(good);
  });

  it("differently-named single-key wrapper → unwrapped", () => {
    const r = parseFinal(msg(JSON.stringify({ disambiguation: good })), schema, "claude-haiku-4-5", "anthropic");
    expect(r.data).toEqual(good);
  });

  it("empty object → still a schema_validation error (nothing to salvage)", () => {
    expect(() => parseFinal(msg("{}"), schema, "claude-haiku-4-5", "anthropic")).toThrow(ResearchError);
    try {
      parseFinal(msg("{}"), schema, "claude-haiku-4-5", "anthropic");
    } catch (err) {
      expect((err as ResearchError).category).toBe("schema_validation");
    }
  });

  it("wrong-shape with no salvageable nested object → schema_validation error", () => {
    expect(() =>
      parseFinal(msg('{"foo":"bar"}'), schema, "claude-haiku-4-5", "anthropic"),
    ).toThrow(ResearchError);
  });
});
