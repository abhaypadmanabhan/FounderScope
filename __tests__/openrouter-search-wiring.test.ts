// The gap that let the live run fail twice: every existing test mocked
// `createSearchProvider`, so the REAL policy wrapper had never been exercised
// from the real tool callback. This file wires the two together with only
// `fetch` and Supabase faked, which is the closest an offline test can get to
// the path that runs live.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// Supabase is the only thing between the policy wrapper and the network that we
// do not want reached. Cache reads miss, writes are no-ops — the live shape.
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      upsert: async () => ({ error: null }),
    }),
  },
}));

type ToolLike = {
  execute: (args: unknown) => Promise<string>;
  inputSchema: z.ZodTypeAny;
};

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

import { runResearchCall } from "@/lib/llm";
import { ResearchError } from "@/lib/llm/errors";
import { SEARCH_BUDGET, createSearchBudget, createSearchUsage } from "@/lib/search";
import { SearchMisconfiguredError, withSearchPolicy } from "@/lib/search/policy";

const schema = z.object({ summary: z.string() });

const config = {
  openrouterKey: "sk-or-v1-test",
  searchKey: "exa-test",
  searchProvider: "exa" as const,
};

function toolFrom(params: Record<string, unknown>): ToolLike {
  const tools = params.tools as Record<string, ToolLike>;
  return tools.web_search;
}

const okResult = {
  output: { summary: "ok" },
  text: '{"summary":"ok"}',
  steps: [{ text: '{"summary":"ok"}' }],
  finishReason: "stop",
  response: { modelId: "m" },
};

// With tools registered the answer now comes from the model's TEXT, not from
// Output.object — a forced response format suppresses tool calls entirely.
// A fake result therefore has to carry the object in `text` like a real one.
function resultFor(object: unknown) {
  const text = JSON.stringify(object);
  return {
    output: object,
    text,
    steps: [{ text }],
    finishReason: "stop",
    response: { modelId: "m" },
  };
}

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  generateTextCalls.length = 0;
  generateTextImpl = async () => okResult;
  fetchMock = vi.fn(async () =>
    Response.json({
      results: [
        { title: "Linear", url: "https://linear.app", highlights: ["Issue tracking"] },
        { title: "Linear blog", url: "https://linear.app/blog", highlights: ["b"] },
        { title: "Linear docs", url: "https://linear.app/docs", highlights: ["c"] },
      ],
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("tool callback against the real search policy", () => {
  it("reaches EXA and counts the call — usage.calls must never silently stay 0", async () => {
    let toolOutput = "";
    generateTextImpl = async (params) => {
      toolOutput = await toolFrom(params).execute({
        query: "Linear company founders",
        num_results: 3,
      });
      return okResult;
    };

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });

    const parsed = JSON.parse(toolOutput) as {
      results?: unknown[];
      error?: string;
    };
    // A blown tool call comes back as {error, results: []} and the model burns
    // a step retrying it. That is what five sections did on the live run.
    expect(parsed.error).toBeUndefined();
    expect(parsed.results).toHaveLength(3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.exa.ai/search");
    expect(result.usage).toEqual({
      calls: 1,
      cacheHits: 0,
      rateLimit429s: 0,
      fallbackHits: 0,
    });
  });

  it("counts every call, so a section that searches five times reports five", async () => {
    generateTextImpl = async (params) => {
      const tool = toolFrom(params);
      for (let i = 0; i < 5; i++) {
        await tool.execute({ query: `q${i}`, num_results: 3 });
      }
      return okResult;
    };

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });

    expect(result.usage?.calls).toBe(5);
  });

  it("enforces the tier cap through the real policy and hands the model the instruction", async () => {
    let lastOutput = "";
    generateTextImpl = async (params) => {
      const tool = toolFrom(params);
      for (let i = 0; i < SEARCH_BUDGET.default + 1; i++) {
        lastOutput = await tool.execute({ query: `q${i}`, num_results: 3 });
      }
      return okResult;
    };

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });

    expect(JSON.parse(lastOutput)).toMatchObject({
      error: expect.stringContaining("budget exhausted"),
      message: expect.stringContaining("Write your final JSON answer now"),
      results: [],
    });
    expect(result.usage?.calls).toBe(SEARCH_BUDGET.default);
    expect(fetchMock).toHaveBeenCalledTimes(SEARCH_BUDGET.default);
  });
});

describe("tool input handling", () => {
  it("accepts the argument shapes a model actually sends", async () => {
    let tool: ToolLike | undefined;
    generateTextImpl = async (params) => {
      tool = toolFrom(params);
      return okResult;
    };
    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    // A tool-call argument that fails inputSchema validation never reaches
    // `execute`, so the callback's try/catch cannot save it: the SDK hands the
    // model an opaque validation error and the model burns a step retrying.
    for (const args of [
      { query: "linear" },
      { query: "linear", num_results: 3 },
      { query: "linear", num_results: "3" },
      { query: "linear", num_results: 3.0 },
      { query: "linear", num_results: 50 },
      { query: "linear", num_results: null },
    ]) {
      const parsed = tool!.inputSchema.safeParse(args);
      expect(
        parsed.success,
        `model-plausible args rejected before execute: ${JSON.stringify(args)}`,
      ).toBe(true);
    }
  });

  it("clamps a silly num_results instead of rejecting the call", async () => {
    let toolOutput = "";
    generateTextImpl = async (params) => {
      const tool = toolFrom(params);
      const parsed = tool.inputSchema.parse({ query: "q", num_results: 50 });
      toolOutput = await tool.execute(parsed);
      return okResult;
    };

    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.numResults).toBeLessThanOrEqual(10);
    expect(JSON.parse(toolOutput).error).toBeUndefined();
  });
});

describe("the tool callback never lets a throw reach the model as an error", () => {
  // Whatever goes wrong below the callback — a provider outage, a wiring
  // mistake, a TypeError from a future refactor — the model must get a readable
  // result. An opaque rejection is what made five sections spend all ten steps
  // retrying on the second live run.
  it.each([
    ["a provider outage", new Error("EXA 503: upstream down")],
    [
      "a missing budget",
      new SearchMisconfiguredError("exa search called without a SearchBudget."),
    ],
    [
      "a raw TypeError",
      new TypeError("Cannot read properties of undefined (reading 'used')"),
    ],
  ])("survives %s", async (_label, thrown) => {
    fetchMock.mockImplementation(async () => {
      throw thrown;
    });

    let toolOutput = "";
    generateTextImpl = async (params) => {
      // Must resolve, not reject.
      toolOutput = await toolFrom(params).execute({ query: "q" });
      return okResult;
    };

    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    const parsed = JSON.parse(toolOutput);
    expect(parsed.results).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("tells the model what to do about an empty query instead of searching for nothing", async () => {
    let toolOutput = "";
    generateTextImpl = async (params) => {
      toolOutput = await toolFrom(params).execute({ query: "   " });
      return okResult;
    };

    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    expect(JSON.parse(toolOutput)).toEqual({
      error: "empty query",
      message: "Call web_search again with a non-empty query string.",
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("policy misuse cannot become a TypeError in the tool callback", () => {
  it("fails with a named, model-readable error when the budget is missing", async () => {
    const backend = {
      id: "exa" as const,
      search: async () => [],
    };
    // The exact call the orchestrator's probe made: no budget in opts. It used
    // to die on `budget.used` deep inside consumeSearchBudget.
    const provider = withSearchPolicy(backend);
    const err = await provider
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .search("q", { numResults: 3 } as any)
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("SearchMisconfiguredError");
    expect((err as Error).message).toMatch(/budget/i);
    expect((err as Error).message).not.toMatch(/Cannot read properties/);
  });

  it("is a compile error to omit the budget", () => {
    const backend = { id: "exa" as const, search: async () => [] };
    const provider = withSearchPolicy(backend);
    // @ts-expect-error budget is required on SearchOptions — omitting it must
    // not typecheck, so this defect cannot be reintroduced silently.
    void provider.search("q", { numResults: 3 });
    expect(typeof provider.search).toBe("function");
  });

  it("still works when a budget is supplied", async () => {
    const provider = withSearchPolicy({
      id: "exa" as const,
      search: async () => [
        { title: "a", url: "https://a.example", highlights: [] },
        { title: "b", url: "https://b.example", highlights: [] },
        { title: "c", url: "https://c.example", highlights: [] },
      ],
    });
    const usage = createSearchUsage();
    const results = await provider.search("q", {
      budget: createSearchBudget("default"),
      usage,
    });
    // Three hits, so the source-fallback threshold is not tripped and this is
    // one live call. Fewer would legitimately cost a second.
    expect(results).toHaveLength(3);
    expect(usage.calls).toBe(1);
  });
});

describe("an empty section is a failure, not a success", () => {
  const sectionSchema = z.object({
    summary: z.string(),
    claims: z.array(
      z.object({ id: z.number(), text: z.string() }),
    ),
  });

  it("rejects a schema-valid object with zero claims", async () => {
    generateTextImpl = async () =>
      resultFor({ summary: "Nothing found.", claims: [] });

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema: sectionSchema,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ResearchError);
    expect(err.category).toBe("model_error");
    expect(err.message).toContain("zero claims");
  });

  it("rejects an empty section recovered through the salvage path too", async () => {
    const { NoObjectGeneratedError } = await import("ai");
    generateTextImpl = async () => {
      throw new NoObjectGeneratedError({
        message: "no object generated",
        text: '{"summary":"Nothing found.","claims":[]}',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: { id: "r", timestamp: new Date(0), modelId: "m" } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usage: {} as any,
        finishReason: "stop",
      });
    };

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema: sectionSchema,
    }).catch((e) => e);

    expect(err.category).toBe("model_error");
    expect(err.message).toContain("zero claims");
  });

  it("accepts a section with at least one claim", async () => {
    generateTextImpl = async () =>
      resultFor({
        summary: "Found something.",
        claims: [{ id: 1, text: "Linear was founded in 2019." }],
      });

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema: sectionSchema,
    });

    expect(
      (result.data as { claims: unknown[] }).claims.length,
    ).toBeGreaterThan(0);
  });

  it("leaves claim-less output shapes alone — disambiguation has no claims", async () => {
    const disambigSchema = z.object({ canonical_name: z.string() });
    generateTextImpl = async () => resultFor({ canonical_name: "Linear" });

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema: disambigSchema,
    });

    expect(result.data).toEqual({ canonical_name: "Linear" });
  });
});

describe("search telemetry survives to RunResult", () => {
  it("reports the real count when searches succeed", async () => {
    generateTextImpl = async (params) => {
      const tool = toolFrom(params);
      await tool.execute({ query: "a" });
      await tool.execute({ query: "b" });
      return okResult;
    };

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });

    expect(result.usage?.calls).toBe(2);
    expect(result.usage?.calls).not.toBe(0);
  });

  it("reports zero only when nothing succeeded, and says why in the failure", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("EXA 401: invalid api key");
    });

    const { NoOutputGeneratedError } = await import("ai");
    generateTextImpl = async (params) => {
      const tool = toolFrom(params);
      await tool.execute({ query: "a" });
      await tool.execute({ query: "b" });
      throw new NoOutputGeneratedError();
    };

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    }).catch((e) => e);

    // usage.calls === 0 with no explanation was the third live run's report for
    // every section. The message now distinguishes "never searched" from
    // "searched and every one failed".
    expect(err.message).toContain("web_search ran 2 time(s), 2 failed");
    expect(err.message).toContain("EXA 401: invalid api key");
  });

  it("says so plainly when the model never called the tool at all", async () => {
    const { NoOutputGeneratedError } = await import("ai");
    generateTextImpl = async () => {
      throw new NoOutputGeneratedError();
    };

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    }).catch((e) => e);

    expect(err.message).toContain("The model never called web_search.");
  });
});

describe("tools: none", () => {
  it("registers no tools and does not spend a step budget", async () => {
    await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
      tools: "none",
    });

    const params = generateTextCalls[0];
    expect(params.tools).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
