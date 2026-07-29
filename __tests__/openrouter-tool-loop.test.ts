// The OpenRouter path's contract with the model: what the search tool hands
// back, and what happens when the SDK cannot produce an object. Both are
// behaviours the old adapters owned and that a section depends on to survive.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

type ToolExecute = (args: {
  query: string;
  num_results?: number;
}) => Promise<string>;

// Captures what the route passed to generateText, and lets each test drive the
// tool by hand instead of pretending to be a model.
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

// Only the provider factory is faked — SearchBudgetExhaustedError and the
// budget helpers stay real so `instanceof` and the cap both mean something.
let searchImpl: (query: string, opts: unknown) => Promise<unknown>;

vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  return {
    ...actual,
    createSearchProvider: (id: string) => ({
      id,
      search: (query: string, opts: unknown) => searchImpl(query, opts),
    }),
  };
});

import {
  SEARCH_BUDGET,
  SEARCH_BUDGET_EXHAUSTED_INSTRUCTION,
  SearchBudgetExhaustedError,
} from "@/lib/search";
import { runResearchCall, MODEL_MAP, modelFor, stepBudgetFor } from "@/lib/llm";
import { ResearchError } from "@/lib/llm/errors";

const schema = z.object({ summary: z.string() });

const config = {
  openrouterKey: "sk-or-v1-test",
  searchKey: "exa-test",
  searchProvider: "exa" as const,
};

function toolFrom(params: Record<string, unknown>): ToolExecute {
  const tools = params.tools as Record<string, { execute: ToolExecute }>;
  return tools.web_search.execute;
}

beforeEach(() => {
  generateTextCalls.length = 0;
  generateTextImpl = async () => ({
    output: { summary: "ok" },
    text: '{"summary":"ok"}',
    response: { modelId: "google/gemini-3.1-flash-lite" },
  });
  searchImpl = async () => [];
});

describe("search tool output shape", () => {
  it("wraps results in a results key, never a bare array", async () => {
    const hits = [
      { title: "A", url: "https://a.example", highlights: ["h"] },
      { title: "B", url: "https://b.example", highlights: [] },
    ];
    searchImpl = async () => hits;

    let toolOutput = "";
    generateTextImpl = async (params) => {
      toolOutput = await toolFrom(params)({ query: "stripe funding" });
      return {
        output: { summary: "ok" },
        text: "{}",
        response: { modelId: "m" },
      };
    };

    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    expect(JSON.parse(toolOutput)).toEqual({ results: hits });
    expect(Array.isArray(JSON.parse(toolOutput))).toBe(false);
  });

  it("passes num_results through and returns an empty results array for no hits", async () => {
    const seen: unknown[] = [];
    searchImpl = async (_query, opts) => {
      seen.push(opts);
      return [];
    };

    let toolOutput = "";
    generateTextImpl = async (params) => {
      toolOutput = await toolFrom(params)({ query: "q", num_results: 3 });
      return { output: { summary: "ok" }, text: "{}", response: { modelId: "m" } };
    };

    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    expect(JSON.parse(toolOutput)).toEqual({ results: [] });
    expect((seen[0] as { numResults?: number }).numResults).toBe(3);
  });
});

describe("budget exhaustion reaches the model", () => {
  it("returns a tool result carrying the instruction verbatim, not a throw", async () => {
    searchImpl = async () => {
      throw new SearchBudgetExhaustedError("exa");
    };

    let toolOutput = "";
    generateTextImpl = async (params) => {
      // Must not reject: an exception here would kill the section and discard
      // every search the model had already banked.
      toolOutput = await toolFrom(params)({ query: "q" });
      return { output: { summary: "ok" }, text: "{}", response: { modelId: "m" } };
    };

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });

    expect(JSON.parse(toolOutput)).toEqual({
      error: "exa_search budget exhausted",
      message: SEARCH_BUDGET_EXHAUSTED_INSTRUCTION,
      results: [],
    });
    expect(SEARCH_BUDGET_EXHAUSTED_INSTRUCTION).toBe(
      "Write your final JSON answer now using prior search results. Do not call exa_search again.",
    );
    expect(result.data).toEqual({ summary: "ok" });
  });

  it("turns any other search failure into a readable blob so the model can rephrase", async () => {
    searchImpl = async () => {
      throw new Error("EXA 500: upstream exploded");
    };

    let toolOutput = "";
    generateTextImpl = async (params) => {
      toolOutput = await toolFrom(params)({ query: "q" });
      return { output: { summary: "ok" }, text: "{}", response: { modelId: "m" } };
    };

    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    expect(JSON.parse(toolOutput)).toEqual({
      error: "EXA 500: upstream exploded",
      results: [],
    });
  });

  it("hands the real budget to the policy layer so the cap is enforced there", async () => {
    const budgets: unknown[] = [];
    searchImpl = async (_query, opts) => {
      budgets.push((opts as { budget: unknown }).budget);
      return [];
    };
    generateTextImpl = async (params) => {
      await toolFrom(params)({ query: "q" });
      return { output: { summary: "ok" }, text: "{}", response: { modelId: "m" } };
    };

    await runResearchCall({ config, tier: "reasoning", prompt: "p", schema });

    expect(budgets[0]).toEqual({ tier: "reasoning", used: 0 });
  });
});

describe("step budget", () => {
  it("leaves room for the structured-output step on top of the search budget", () => {
    // The SDK counts emitting the object as its own step. Budget + 1 for the
    // exhausted-blob call the model may still make, + 1 for that output step.
    expect(stepBudgetFor("default")).toBe(SEARCH_BUDGET.default + 2);
    expect(stepBudgetFor("reasoning")).toBe(SEARCH_BUDGET.reasoning + 2);
    expect(stepBudgetFor("default")).toBe(10);
    expect(stepBudgetFor("reasoning")).toBe(12);
  });
});

describe("model map", () => {
  const savedDefault = process.env.FS_MODEL_DEFAULT;
  const savedReasoning = process.env.FS_MODEL_REASONING;

  afterEach(() => {
    if (savedDefault === undefined) delete process.env.FS_MODEL_DEFAULT;
    else process.env.FS_MODEL_DEFAULT = savedDefault;
    if (savedReasoning === undefined) delete process.env.FS_MODEL_REASONING;
    else process.env.FS_MODEL_REASONING = savedReasoning;
  });

  it("hardcodes the two-tier map", () => {
    expect(MODEL_MAP).toEqual({
      default: "google/gemini-3.1-flash-lite",
      reasoning: "deepseek/deepseek-v4-pro",
    });
  });

  it("honours the eval-only env overrides", () => {
    process.env.FS_MODEL_DEFAULT = "openai/gpt-test";
    process.env.FS_MODEL_REASONING = "anthropic/claude-test";
    expect(modelFor("default")).toBe("openai/gpt-test");
    expect(modelFor("reasoning")).toBe("anthropic/claude-test");
  });

  it("ignores a blank override rather than sending an empty model id", () => {
    process.env.FS_MODEL_DEFAULT = "   ";
    expect(modelFor("default")).toBe("google/gemini-3.1-flash-lite");
  });
});

describe("structured-output salvage", () => {
  async function failWith(text: string) {
    const { NoObjectGeneratedError } = await import("ai");
    generateTextImpl = async () => {
      throw new NoObjectGeneratedError({
        message: "no object generated",
        text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: { id: "r", timestamp: new Date(0), modelId: "m" } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usage: {} as any,
        finishReason: "stop",
      });
    };
  }

  it("recovers fenced JSON the SDK refused", async () => {
    await failWith('Here you go:\n```json\n{"summary":"fenced"}\n```');
    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });
    expect(result.data).toEqual({ summary: "fenced" });
  });

  it("unwraps a single-key wrapper the model added", async () => {
    await failWith('{"result":{"summary":"wrapped"}}');
    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });
    expect(result.data).toEqual({ summary: "wrapped" });
  });

  it("surfaces the model's own words when it answered with a bare string", async () => {
    await failWith('"I could not find reliable information."');
    await expect(
      runResearchCall({ config, tier: "default", prompt: "p", schema }),
    ).rejects.toMatchObject({
      name: "ResearchError",
      category: "model_error",
    });
  });

  it("fails as schema_validation when nothing is salvageable", async () => {
    await failWith('{"unrelated":true}');
    await expect(
      runResearchCall({ config, tier: "default", prompt: "p", schema }),
    ).rejects.toMatchObject({ category: "schema_validation" });
  });
});

describe("error mapping", () => {
  it("maps a 401 from OpenRouter to auth_error", async () => {
    const { APICallError } = await import("ai");
    generateTextImpl = async () => {
      throw new APICallError({
        message: "Unauthorized",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
      });
    };

    await expect(
      runResearchCall({ config, tier: "default", prompt: "p", schema }),
    ).rejects.toMatchObject({ category: "auth_error" });
  });

  it("maps an unknown failure to model_error rather than leaking it raw", async () => {
    generateTextImpl = async () => {
      throw new Error("socket hang up");
    };

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ResearchError);
    expect(err.category).toBe("model_error");
    expect(err.message).toContain("socket hang up");
  });
});
