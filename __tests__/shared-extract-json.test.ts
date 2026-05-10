// Unit tests for extractJson in shared.ts.
// Covers the enhanced multi-fence handling added for Kimi K2.6 compatibility.
import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/llm/shared";

describe("extractJson", () => {
  it("plain JSON — no fences, no prose", () => {
    const input = '{"a":1,"b":"hello"}';
    expect(extractJson(input)).toBe('{"a":1,"b":"hello"}');
  });

  it("plain JSON array — no fences", () => {
    const input = '[1,2,3]';
    expect(extractJson(input)).toBe('[1,2,3]');
  });

  it("fenced JSON — ```json block, no prose", () => {
    const input = "```json\n{\"a\":1}\n```";
    expect(extractJson(input)).toBe('{"a":1}');
  });

  it("fenced JSON — ``` block without language tag", () => {
    const input = "```\n{\"a\":1}\n```";
    expect(extractJson(input)).toBe('{"a":1}');
  });

  it("fenced JSON with prose preamble", () => {
    const input = `Here is my answer:\n\`\`\`json\n{"result":"ok"}\n\`\`\``;
    expect(JSON.parse(extractJson(input))).toEqual({ result: "ok" });
  });

  it("fenced JSON with prose AFTER the fence block", () => {
    const input = `\`\`\`json\n{"result":"ok"}\n\`\`\`\n\nThat's the JSON answer above.`;
    expect(JSON.parse(extractJson(input))).toEqual({ result: "ok" });
  });

  it("multiple fenced blocks — extracts the LAST one (final answer, not example)", () => {
    const input = [
      "Here is an example first:",
      "```json",
      '{"example":true}',
      "```",
      "",
      "And here is the real answer:",
      "```json",
      '{"final":true,"value":42}',
      "```",
    ].join("\n");
    expect(JSON.parse(extractJson(input))).toEqual({ final: true, value: 42 });
  });

  it("no fence, JSON with prose preamble — brace-trim fallback", () => {
    const input = 'Here is the answer: {"key":"value"}';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("no fence, JSON with trailing prose — brace-trim fallback", () => {
    const input = '{"key":"value"} and some extra text';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("nested JSON with fences — inner braces are preserved", () => {
    const input = "```json\n{\"outer\":{\"inner\":1}}\n```";
    expect(JSON.parse(extractJson(input))).toEqual({ outer: { inner: 1 } });
  });

  it("whitespace-only preamble before brace", () => {
    const input = "   \n   {\"a\":1}";
    expect(JSON.parse(extractJson(input))).toEqual({ a: 1 });
  });
});
