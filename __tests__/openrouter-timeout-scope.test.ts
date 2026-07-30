// Regression cover for the two defects the first live run exposed:
//
//   1. The 60s timeout was carried over from the old adapter, where it bounded
//      ONE API turn inside a 12-turn loop. Under generateText it bounded the
//      ENTIRE loop — every round trip, every web search, and the final
//      structured-output step — so 3 of 7 sections died at exactly 60s.
//   2. `result.output` throws NoOutputGeneratedError when the loop ends without
//      an object, which surfaced as "Unexpected OpenRouter error: No output
//      generated." with nothing actionable in it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

type ToolExecute = (args: {
  query: string;
  num_results?: number;
}) => Promise<string>;

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

import { NoOutputGeneratedError } from "ai";
import { runResearchCall } from "@/lib/llm";
import {
  stepBudgetFor,
  stepTimeoutMsFor,
  totalTimeoutMsFor,
} from "@/lib/llm/openrouter";
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

const okResult = {
  output: { summary: "ok" },
  text: '{"summary":"ok"}',
  steps: [{ text: '{"summary":"ok"}' }],
  finishReason: "stop",
  response: { modelId: "m" },
};

beforeEach(() => {
  generateTextCalls.length = 0;
  generateTextImpl = async () => okResult;
  searchImpl = async () => [];
});

describe("timeout scope", () => {
  it("bounds each step, not the whole loop, and never with a single flat abort", async () => {
    await runResearchCall({ config, tier: "default", prompt: "p", schema });

    const params = generateTextCalls[0];
    // The old shape's only mechanism was one AbortController armed at 60s.
    expect(params.abortSignal).toBeUndefined();
    expect(params.timeout).toEqual({
      stepMs: stepTimeoutMsFor("default"),
      totalMs: totalTimeoutMsFor("default"),
    });
  });

  it("keeps the fast tier's per-turn ceiling at the old 60s", () => {
    // Six default-tier sections passed live on this value; it is not the
    // number that needed changing.
    expect(stepTimeoutMsFor("default")).toBe(60_000);
  });

  it("gives the reasoning tier room for a thinking phase", async () => {
    // moat is the only reasoning-tier section and the only one that died on
    // "Step timeout of 60000ms exceeded" — a thinking model's step is
    // legitimately slower, so the ceiling is scaled to that one difference.
    expect(stepTimeoutMsFor("reasoning")).toBe(240_000);
    expect(stepTimeoutMsFor("reasoning")).toBeGreaterThan(
      stepTimeoutMsFor("default"),
    );

    await runResearchCall({ config, tier: "reasoning", prompt: "p", schema });

    expect(generateTextCalls[0].timeout).toEqual({
      stepMs: 240_000,
      totalMs: totalTimeoutMsFor("reasoning"),
    });
  });

  it("keeps the whole-loop backstop consistent with the per-step ceiling", () => {
    // Summing the per-step ceiling across every step would hand the reasoning
    // tier 56 minutes. Instead: a couple of genuinely slow steps at that tier's
    // ceiling, the rest priced at fast-tier speed.
    expect(totalTimeoutMsFor("default")).toBe(stepBudgetFor("default") * 60_000);
    expect(totalTimeoutMsFor("default")).toBe(12 * 60_000);
    expect(totalTimeoutMsFor("reasoning")).toBe(20 * 60_000);

    for (const tier of ["default", "reasoning"] as const) {
      // A loop must be able to afford at least two worst-case steps, and must
      // still be shorter than the sum of every step at its ceiling.
      expect(totalTimeoutMsFor(tier)).toBeGreaterThanOrEqual(
        2 * stepTimeoutMsFor(tier),
      );
      expect(totalTimeoutMsFor(tier)).toBeLessThanOrEqual(
        stepBudgetFor(tier) * stepTimeoutMsFor(tier),
      );
    }
  });

  // The behavioural half. Five sequential searches at 30s each is 150s of loop
  // time — routine for a section, and impossible under a 60s abort wrapped
  // around everything. The mock honours params.abortSignal exactly as the SDK
  // does, so this fails against the old shape at the second search.
  it("lets a section run five 30s searches without being aborted", async () => {
    vi.useFakeTimers();
    try {
      searchImpl = async () => {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        return [{ title: "t", url: "https://e.example", highlights: [] }];
      };

      let searchesCompleted = 0;
      generateTextImpl = async (params) => {
        const execute = toolFrom(params);
        for (let i = 0; i < 5; i++) {
          const pending = execute({ query: `q${i}` });
          await vi.advanceTimersByTimeAsync(30_000);
          await pending;
          const signal = params.abortSignal as AbortSignal | undefined;
          if (signal?.aborted) {
            throw new DOMException("This operation was aborted", "AbortError");
          }
          searchesCompleted++;
        }
        return okResult;
      };

      const pending = runResearchCall({
        config,
        tier: "default",
        prompt: "p",
        schema,
      });
      await vi.advanceTimersByTimeAsync(0);
      const result = await pending;

      expect(searchesCompleted).toBe(5);
      expect(result.data).toEqual({ summary: "ok" });
    } finally {
      vi.useRealTimers();
    }
  });

  // Pins down what the old shape did to the same workload, so the assertions
  // above are anchored to a demonstrated failure rather than an argument. This
  // is the b1 code path reproduced in five lines: one controller, armed once,
  // aborting everything.
  it("demonstrates the old flat-60s abort killing that same workload", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 60_000);

      let searchesCompleted = 0;
      const run = (async () => {
        for (let i = 0; i < 5; i++) {
          const pending = new Promise((resolve) =>
            setTimeout(resolve, 30_000),
          );
          await vi.advanceTimersByTimeAsync(30_000);
          await pending;
          if (controller.signal.aborted) {
            throw new DOMException("This operation was aborted", "AbortError");
          }
          searchesCompleted++;
        }
      })();

      await expect(run).rejects.toThrow(/aborted/i);
      // Two searches in and the section is dead — which is what the live run
      // saw on tech_stack, funding and market.
      expect(searchesCompleted).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("distinguishes a total timeout from a step timeout", async () => {
    generateTextImpl = async () => {
      throw new DOMException(
        "Total timeout of 1200000ms exceeded",
        "TimeoutError",
      );
    };

    vi.useFakeTimers();
    let err: unknown;
    try {
      const pending = runResearchCall({
        config,
        tier: "reasoning",
        prompt: "p",
        schema,
      }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(20_000);
      err = await pending;
    } finally {
      vi.useRealTimers();
    }

    // Same category, different cause: one slow round trip versus a loop that
    // never converged. The message has to say which.
    expect((err as ResearchError).category).toBe("timeout");
    expect((err as ResearchError).message).toContain("Total timeout");
    expect((err as ResearchError).message).not.toContain("Step timeout");
  });

  it("names which clock ran out instead of quoting a constant", async () => {
    generateTextImpl = async () => {
      throw new DOMException("Step timeout of 60000ms exceeded", "TimeoutError");
    };

    // A timeout is retryable, so withRetry sleeps 2s then 8s before giving up.
    vi.useFakeTimers();
    let err: unknown;
    try {
      const pending = runResearchCall({
        config,
        tier: "default",
        prompt: "p",
        schema,
      }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(20_000);
      err = await pending;
    } finally {
      vi.useRealTimers();
    }

    expect(err).toBeInstanceOf(ResearchError);
    expect((err as ResearchError).category).toBe("timeout");
    expect((err as ResearchError).message).toContain(
      "Step timeout of 60000ms exceeded",
    );
    // Three attempts, as the old adapter did for timeouts.
    expect(generateTextCalls.length).toBe(3);
  });
});

describe("no structured output", () => {
  function noOutputResult(overrides: Record<string, unknown>) {
    return {
      // The SDK's own getter throws exactly this when the loop ends objectless.
      get output(): unknown {
        throw new NoOutputGeneratedError();
      },
      text: "",
      steps: [],
      finishReason: "stop",
      response: { modelId: "m" },
      ...overrides,
    };
  }

  it("recovers the answer from step text when the model wrote JSON but never emitted the object", async () => {
    generateTextImpl = async () =>
      noOutputResult({
        steps: [
          { text: "Let me search first." },
          { text: '```json\n{"summary":"recovered"}\n```' },
        ],
        text: '```json\n{"summary":"recovered"}\n```',
      });

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    });

    expect(result.data).toEqual({ summary: "recovered" });
  });

  it("says it ran out of steps rather than 'No output generated'", async () => {
    generateTextImpl = async () =>
      noOutputResult({
        steps: Array.from({ length: stepBudgetFor("default") }, () => ({
          text: "",
        })),
        finishReason: "tool-calls",
      });

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ResearchError);
    expect(err.category).toBe("model_error");
    expect(err.message).toContain(
      `${stepBudgetFor("default")} of ${stepBudgetFor("default")} allowed steps`,
    );
    expect(err.message).toContain("finishReason=tool-calls");
    expect(err.message).toContain("ran out of steps");
    expect(err.message).not.toBe("No output generated.");
  });

  it("says it stopped early when it quit under budget with nothing to show", async () => {
    generateTextImpl = async () =>
      noOutputResult({ steps: [{ text: "" }], finishReason: "stop" });

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
    }).catch((e) => e);

    expect(err.category).toBe("model_error");
    expect(err.message).toContain("1 of 12 allowed steps");
    expect(err.message).toContain("stopped early");
  });
});

afterEach(() => {
  vi.useRealTimers();
});
