// Regressions for the two HIGH findings of the manual review of PR #1. Both
// were type-correct, test-covered code that was wrong against real model
// behaviour — the class of defect this migration shipped six of, and the class
// a green offline suite is worst at catching.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
// Static, not top-level await: vi.mock is hoisted above these regardless.
import { runResearchCall } from "@/lib/llm";
import { SEARCH_TOOL_INPUT_SCHEMA } from "@/lib/llm/openrouter";

const generateTextCalls: Array<Record<string, unknown>> = [];
let generateTextImpl: (params: Record<string, unknown>) => Promise<unknown>;

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: async (params: Record<string, unknown>) => {
      generateTextCalls.push(params);
      return generateTextImpl(params);
    },
  };
});

let searchCalls: string[] = [];
vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  return {
    ...actual,
    createSearchProvider: () => ({
      id: "exa" as const,
      search: async (query: string) => {
        searchCalls.push(query);
        return [{ title: "t", url: "https://example.com", highlights: ["h"] }];
      },
    }),
  };
});


const schema = z.object({ claims: z.array(z.object({ text: z.string() })) });
const config = {
  openrouterKey: "sk-or-v1-test",
  searchKey: "exa-test",
  searchProvider: "exa" as const,
};

beforeEach(() => {
  generateTextCalls.length = 0;
  searchCalls = [];
});
afterEach(() => vi.clearAllMocks());

describe("a malformed tool call must never become a paid search", () => {
  // z.coerce.string() is String(input): `{}` and a misnamed key both yield the
  // string "undefined", which is nine characters, so the empty-query guard in
  // runSearchTool cannot catch it. The section would spend a budget slot, a
  // step, and real money searching the web for the word "undefined".
  it.each([
    ["empty payload", {}],
    ["null query", { query: null }],
    ["misnamed key", { q: "the real query" }],
    ["object query", { query: { a: 1 } }],
  ])("rejects %s instead of coercing it to a searchable string", (_label, input) => {
    const result = SEARCH_TOOL_INPUT_SCHEMA.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("still accepts a real query, and still coerces num_results from a string", () => {
    const result = SEARCH_TOOL_INPUT_SCHEMA.safeParse({
      query: "linear app founders",
      num_results: "3",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ query: "linear app founders", num_results: 3 });
  });

  it("never yields the sentinel strings that would sail past the empty-query guard", () => {
    for (const input of [{}, { query: null }, { q: "x" }]) {
      const result = SEARCH_TOOL_INPUT_SCHEMA.safeParse(input);
      const query = result.success ? result.data.query : null;
      expect(query).not.toBe("undefined");
      expect(query).not.toBe("null");
      expect(query).not.toBe("[object Object]");
    }
  });
});

describe("an earlier step must not destroy a valid final answer", () => {
  const answer = JSON.stringify({ claims: [{ text: "real answer" }] });

  it("recovers the last step's JSON when an earlier step also contains a brace", async () => {
    // extractJson slices from the first `{` to the last `}`. Concatenating
    // these two steps spans both objects and fails to parse, even though the
    // model's final answer was perfectly valid.
    generateTextImpl = async () => ({
      steps: [
        { text: `I'll research this. Considering {the moat} angle first.` },
        { text: answer },
      ],
      finishReason: "stop",
      get output(): never {
        throw new Error("no output");
      },
    });

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });
    expect(result.data).toEqual({ claims: [{ text: "real answer" }] });
  });

  it("recovers when the model emitted its answer twice across steps", async () => {
    generateTextImpl = async () => ({
      steps: [{ text: answer }, { text: answer }],
      finishReason: "stop",
      get output(): never {
        throw new Error("no output");
      },
    });

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });
    expect(result.data).toEqual({ claims: [{ text: "real answer" }] });
  });

  it("still falls back to the concatenation when only the join parses", async () => {
    // The behaviour the concatenation exists for: a model that split one JSON
    // object across two steps. The last step alone is not valid JSON.
    generateTextImpl = async () => ({
      steps: [{ text: `{"claims": [{"text":` }, { text: ` "split answer"}]}` }],
      finishReason: "stop",
      get output(): never {
        throw new Error("no output");
      },
    });

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });
    expect(result.data).toEqual({ claims: [{ text: "split answer" }] });
  });
});
