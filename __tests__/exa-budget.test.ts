// Tests that the EXA budget enforcement in both adapters caps real EXA calls
// and returns a "budget exhausted" tool_result for overflow calls.
//
// Strategy: Mock the Anthropic SDK to emit multiple tool_use responses with
// batches of exa_search calls, then mock handleExaSearch to count actual EXA
// hits. After budget exhaustion, overflow calls must NOT reach EXA.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EXA_BUDGET } from "@/lib/llm/types";
import { z } from "zod";
import type { RunArgs } from "@/lib/llm/types";

// ---------------------------------------------------------------------------
// Track actual EXA invocations (calls that go through to the real EXA client)
// ---------------------------------------------------------------------------
const exaHits: string[] = [];

vi.mock("@/lib/llm/tools/exa-search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/llm/tools/exa-search")>();
  return {
    ...original,
    handleExaSearch: vi.fn(async (input: { query: string }) => {
      exaHits.push(input.query);
      return JSON.stringify({ results: [{ title: "t", url: "https://example.com", highlights: [] }] });
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK
// ---------------------------------------------------------------------------
// We emit a sequence of responses:
//   Turn 1-N: stop_reason="tool_use" with BATCH_SIZE exa_search calls each
//   Last turn: stop_reason="end_turn" with a text JSON
//
// The mock uses a call counter to emit the right response each time.

type MockToolCall = { id: string; name: string; input: { query: string } };

function makeToolUseResponse(calls: MockToolCall[], model: string) {
  return {
    model,
    stop_reason: "tool_use",
    content: calls.map((c) => ({
      type: "tool_use",
      id: c.id,
      name: c.name,
      input: c.input,
    })),
  };
}

function makeEndTurnResponse(model: string) {
  return {
    model,
    stop_reason: "end_turn",
    content: [{ type: "text", text: '{"ok":true}' }],
  };
}

// Shared call sequence state — reset per test.
let sdkCallCount = 0;
let sdkResponseSequence: ReturnType<typeof makeToolUseResponse | typeof makeEndTurnResponse>[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIErr extends Error {}
  class AuthenticationError extends APIErr {}
  class RateLimitError extends APIErr {}
  class APIError extends APIErr {}
  class APIUserAbortError extends APIErr {
    name = "AbortError";
  }
  class MockAnthropic {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beta: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {
      this.beta = {
        messages: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          create: async (_params: any) => {
            const resp = sdkResponseSequence[sdkCallCount] ?? makeEndTurnResponse(_params.model ?? "kimi-k2.6");
            sdkCallCount++;
            return resp;
          },
        },
      };
    }
  }
  return {
    default: MockAnthropic,
    AuthenticationError,
    RateLimitError,
    APIError,
    APIUserAbortError,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SimpleSchema = z.object({ ok: z.boolean() });

function makeKimiArgs(tier: "default" | "reasoning"): RunArgs<{ ok: boolean }> {
  return {
    config: {
      provider: "kimi",
      searchBackend: "exa",
      llmKey: "km-test",
      exaKey: "exa-test",
    },
    tier,
    prompt: "research this company",
    schema: SimpleSchema,
  };
}

function makeAnthropicArgs(tier: "default" | "reasoning"): RunArgs<{ ok: boolean }> {
  return {
    config: {
      provider: "anthropic",
      searchBackend: "exa",
      llmKey: "sk-test",
      exaKey: "exa-test",
    },
    tier,
    prompt: "research this company",
    schema: SimpleSchema,
  };
}

// Build a response sequence: `toolTurns` turns each with `callsPerTurn`
// exa_search calls, then one end_turn.
function buildSequence(
  model: string,
  toolTurns: number,
  callsPerTurn: number,
): ReturnType<typeof makeToolUseResponse | typeof makeEndTurnResponse>[] {
  const seq: ReturnType<typeof makeToolUseResponse | typeof makeEndTurnResponse>[] = [];
  let callIdCounter = 0;
  for (let t = 0; t < toolTurns; t++) {
    const calls: MockToolCall[] = [];
    for (let c = 0; c < callsPerTurn; c++) {
      callIdCounter++;
      calls.push({
        id: `call-${callIdCounter}`,
        name: "exa_search",
        input: { query: `query-${callIdCounter}` },
      });
    }
    seq.push(makeToolUseResponse(calls, model));
  }
  seq.push(makeEndTurnResponse(model));
  return seq;
}

beforeEach(() => {
  exaHits.length = 0;
  sdkCallCount = 0;
  sdkResponseSequence = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EXA_BUDGET constant", () => {
  it("default budget is 8", () => {
    expect(EXA_BUDGET.default).toBe(8);
  });
  it("reasoning budget is 10", () => {
    expect(EXA_BUDGET.reasoning).toBe(10);
  });
});

describe("Kimi adapter — EXA budget enforcement", () => {
  it("caps at budget=8 when model would make 12 calls (3 turns × 4)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");

    // 3 turns × 4 calls = 12 total requested; budget=8 → only 8 hit EXA
    sdkResponseSequence = buildSequence("kimi-k2.6", 3, 4);

    const result = await runKimi(makeKimiArgs("default"));
    expect(result.data).toEqual({ ok: true });

    // Exactly 8 real EXA calls
    expect(exaHits.length).toBe(EXA_BUDGET.default);
  });

  it("does NOT cap when total calls are within budget", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");

    // 1 turn × 5 calls = 5 total; budget=8 → all 5 hit EXA
    sdkResponseSequence = buildSequence("kimi-k2.6", 1, 5);

    await runKimi(makeKimiArgs("default"));
    expect(exaHits.length).toBe(5);
  });

  it("reasoning tier uses budget=10", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");

    // 4 turns × 4 calls = 16 total; reasoning budget=10 → only 10 hit EXA
    sdkResponseSequence = buildSequence("kimi-k2.6", 4, 4);

    await runKimi(makeKimiArgs("reasoning"));
    expect(exaHits.length).toBe(EXA_BUDGET.reasoning);
  });
});

describe("Anthropic adapter — EXA budget enforcement (exa backend)", () => {
  it("caps at budget=8 when model would make 12 calls (3 turns × 4)", async () => {
    const { runAnthropic } = await import("@/lib/llm/adapters/anthropic");

    sdkResponseSequence = buildSequence("claude-haiku-4-5", 3, 4);

    const result = await runAnthropic(makeAnthropicArgs("default"));
    expect(result.data).toEqual({ ok: true });

    expect(exaHits.length).toBe(EXA_BUDGET.default);
  });

  it("does NOT cap when total calls are within budget", async () => {
    const { runAnthropic } = await import("@/lib/llm/adapters/anthropic");

    sdkResponseSequence = buildSequence("claude-haiku-4-5", 1, 3);

    await runAnthropic(makeAnthropicArgs("default"));
    expect(exaHits.length).toBe(3);
  });
});
