// Unit tests for the OpenAI-compat Kimi adapter (api.moonshot.ai/v1).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { RunArgs } from "@/lib/llm/types";
import { EXA_BUDGET } from "@/lib/llm/types";

// ---------------------------------------------------------------------------
// Recording state shared by the openai mock and assertions.
// ---------------------------------------------------------------------------
type RecordedCall = {
  params: Record<string, unknown>;
  options?: Record<string, unknown>;
};
const sdkCalls: RecordedCall[] = [];
const openaiCtorOpts: unknown[] = [];

type ChatResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
};
let chatResponseSequence: ChatResponse[] = [];
let chatResponseIndex = 0;
let nextCreateError: unknown = null;        // single-shot
let persistentCreateError: unknown = null;  // every call until cleared

const exaHits: string[] = [];

vi.mock("@/lib/llm/tools/exa-search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/llm/tools/exa-search")>();
  return {
    ...original,
    handleExaSearch: vi.fn(async (input: { query: string }) => {
      exaHits.push(input.query);
      return JSON.stringify({
        results: [{ title: "t", url: "https://example.com", highlights: [] }],
      });
    }),
  };
});

vi.mock("openai", () => {
  class OpenAIError extends Error {
    status?: number;
    constructor(msg: string, status?: number) {
      super(msg);
      this.status = status;
    }
  }
  class APIUserAbortError extends OpenAIError {
    name = "AbortError";
  }
  class AuthenticationError extends OpenAIError {
    constructor(msg = "Unauthorized") {
      super(msg, 401);
    }
  }
  class RateLimitError extends OpenAIError {
    constructor(msg = "Slow down") {
      super(msg, 429);
    }
  }
  class APIError extends OpenAIError {}

  class MockOpenAI {
    chat: {
      completions: {
        create: (params: unknown, options?: unknown) => Promise<unknown>;
      };
    };
    constructor(opts: unknown) {
      openaiCtorOpts.push(opts);
      this.chat = {
        completions: {
          create: async (params: unknown, options?: unknown) => {
            sdkCalls.push({
              params: params as Record<string, unknown>,
              options: options as Record<string, unknown> | undefined,
            });
            if (persistentCreateError !== null) throw persistentCreateError;
            if (nextCreateError !== null) {
              const e = nextCreateError;
              nextCreateError = null;
              throw e;
            }
            const resp = chatResponseSequence[chatResponseIndex++];
            if (!resp) {
              return {
                id: "chatcmpl-default",
                model: (params as { model: string }).model,
                choices: [
                  {
                    index: 0,
                    finish_reason: "stop",
                    message: { role: "assistant", content: '{"ok":true}' },
                  },
                ],
              };
            }
            return resp;
          },
        },
      };
    }
  }
  return {
    default: MockOpenAI,
    OpenAI: MockOpenAI,
    APIError,
    APIUserAbortError,
    AuthenticationError,
    RateLimitError,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SimpleSchema = z.object({ ok: z.boolean() });

function makeArgs(tier: "default" | "reasoning"): RunArgs<{ ok: boolean }> {
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
    cacheKey: tier === "reasoning"
      ? "founderscope:section:moat"
      : "founderscope:section:snapshot",
  };
}

function stopResponse(model: string, json = '{"ok":true}'): ChatResponse {
  return {
    id: "chatcmpl-stop",
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: json },
      },
    ],
  };
}

function toolCallResponse(
  model: string,
  toolCalls: Array<{ id: string; name: string; args: object }>,
): ChatResponse {
  return {
    id: "chatcmpl-tools",
    model,
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: toolCalls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
  };
}

beforeEach(() => {
  sdkCalls.length = 0;
  openaiCtorOpts.length = 0;
  exaHits.length = 0;
  chatResponseSequence = [];
  chatResponseIndex = 0;
  nextCreateError = null;
  persistentCreateError = null;
});

// ---------------------------------------------------------------------------
// Tier + config tests
// ---------------------------------------------------------------------------

describe("Kimi adapter — tier mapping", () => {
  it("default tier → kimi-k2.5, max_tokens 8192, no thinking, no temperature (model forces 1.0)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.5")];
    await runKimi(makeArgs("default"));
    expect(sdkCalls).toHaveLength(1);
    const p = sdkCalls[0].params;
    expect(p.model).toBe("kimi-k2.5");
    expect(p.max_tokens).toBe(8192);
    expect(p.thinking).toBeUndefined();
    // K2.5 rejects custom temperature ("only 1 is allowed for this model").
    expect(p.temperature).toBeUndefined();
  });

  it("reasoning tier → kimi-k2.6, max_tokens 16384, thinking.enabled, no temperature", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.6")];
    await runKimi(makeArgs("reasoning"));
    expect(sdkCalls).toHaveLength(1);
    const p = sdkCalls[0].params;
    expect(p.model).toBe("kimi-k2.6");
    expect(p.max_tokens).toBe(16384);
    expect(p.thinking).toEqual({ type: "enabled" });
    expect(p.temperature).toBeUndefined();
  });
});

describe("Kimi adapter — strict json_schema + cache key", () => {
  it("passes prompt_cache_key from RunArgs.cacheKey", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.5")];
    await runKimi(makeArgs("default"));
    const p = sdkCalls[0].params;
    expect(p.prompt_cache_key).toBe("founderscope:section:snapshot");
  });

  it("emits response_format json_schema strict from the Zod schema", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.5")];
    await runKimi(makeArgs("default"));
    const p = sdkCalls[0].params as Record<string, unknown>;
    const rf = p.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: { type: string } };
    };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.name).toBe("snapshot");
    expect(rf.json_schema.schema.type).toBe("object");
  });

  it("falls back json_schema name to 'section' when cacheKey is missing", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.5")];
    await runKimi({ ...makeArgs("default"), cacheKey: undefined });
    const p = sdkCalls[0].params as Record<string, unknown>;
    const rf = p.response_format as { json_schema: { name: string } };
    expect(rf.json_schema.name).toBe("section");
    expect(p.prompt_cache_key).toBeUndefined();
  });

  it("declares the EXA function tool", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.5")];
    await runKimi(makeArgs("default"));
    const p = sdkCalls[0].params as Record<string, unknown>;
    const tools = p.tools as Array<{ type: string; function: { name: string } }>;
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("function");
    expect(tools[0].function.name).toBe("exa_search");
  });

  it("uses base URL https://api.moonshot.ai/v1 and disables SDK retries", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2.5")];
    await runKimi(makeArgs("default"));
    expect(openaiCtorOpts).toHaveLength(1);
    const opts = openaiCtorOpts[0] as { baseURL?: string; maxRetries?: number; apiKey?: string };
    expect(opts.baseURL).toBe("https://api.moonshot.ai/v1");
    expect(opts.maxRetries).toBe(0);
    expect(opts.apiKey).toBe("km-test");
  });
});

// ---------------------------------------------------------------------------
// Tool loop tests
// ---------------------------------------------------------------------------

describe("Kimi adapter — tool loop", () => {
  it("dispatches exa_search tool calls and continues until finish_reason=stop", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2.5", [
        { id: "tc-1", name: "exa_search", args: { query: "stripe payments" } },
      ]),
      stopResponse("kimi-k2.5"),
    ];
    const result = await runKimi(makeArgs("default"));
    expect(result.data).toEqual({ ok: true });
    expect(exaHits).toEqual(["stripe payments"]);
    expect(sdkCalls).toHaveLength(2);
    const secondMessages = (sdkCalls[1].params.messages as Array<{ role: string }>);
    expect(secondMessages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("rejects unknown tool calls with model_error", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2.5", [
        { id: "tc-1", name: "scan_filesystem", args: { path: "/" } },
      ]),
    ];
    await expect(runKimi(makeArgs("default"))).rejects.toMatchObject({
      category: "model_error",
      message: expect.stringMatching(/unsupported tool: scan_filesystem/),
    });
    expect(exaHits).toHaveLength(0);
  });

  it("throws model_error after MAX_TURNS=16 of tool calls", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = Array.from({ length: 17 }, (_, i) =>
      toolCallResponse("kimi-k2.5", [
        { id: `tc-${i}`, name: "exa_search", args: { query: `q-${i}` } },
      ]),
    );
    await expect(runKimi(makeArgs("default"))).rejects.toMatchObject({
      category: "model_error",
      message: expect.stringMatching(/exceeded max tool turns/),
    });
  });

  it("throws model_error when finish_reason=tool_calls but tool_calls is empty", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      {
        id: "chatcmpl-empty-tools",
        model: "kimi-k2.5",
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: { role: "assistant", content: null }, // no tool_calls field
          },
        ],
      },
    ];
    await expect(runKimi(makeArgs("default"))).rejects.toMatchObject({
      category: "model_error",
      message: expect.stringMatching(/finish_reason=tool_calls with no tool_calls/),
    });
  });
});

describe("Kimi adapter — EXA budget enforcement", () => {
  it("default tier caps at budget=8 even when 12 calls are made (3 turns × 4)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2.5", [
        { id: "a1", name: "exa_search", args: { query: "q1" } },
        { id: "a2", name: "exa_search", args: { query: "q2" } },
        { id: "a3", name: "exa_search", args: { query: "q3" } },
        { id: "a4", name: "exa_search", args: { query: "q4" } },
      ]),
      toolCallResponse("kimi-k2.5", [
        { id: "b1", name: "exa_search", args: { query: "q5" } },
        { id: "b2", name: "exa_search", args: { query: "q6" } },
        { id: "b3", name: "exa_search", args: { query: "q7" } },
        { id: "b4", name: "exa_search", args: { query: "q8" } },
      ]),
      toolCallResponse("kimi-k2.5", [
        { id: "c1", name: "exa_search", args: { query: "q9" } },
        { id: "c2", name: "exa_search", args: { query: "q10" } },
        { id: "c3", name: "exa_search", args: { query: "q11" } },
        { id: "c4", name: "exa_search", args: { query: "q12" } },
      ]),
      stopResponse("kimi-k2.5"),
    ];
    await runKimi(makeArgs("default"));
    expect(exaHits.length).toBe(EXA_BUDGET.default);
  });

  it("reasoning tier caps at budget=10", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      ...Array.from({ length: 4 }, (_, t) =>
        toolCallResponse("kimi-k2.6", [
          { id: `t${t}-1`, name: "exa_search", args: { query: `q${t}-1` } },
          { id: `t${t}-2`, name: "exa_search", args: { query: `q${t}-2` } },
          { id: `t${t}-3`, name: "exa_search", args: { query: `q${t}-3` } },
          { id: `t${t}-4`, name: "exa_search", args: { query: `q${t}-4` } },
        ]),
      ),
      stopResponse("kimi-k2.6"),
    ];
    await runKimi(makeArgs("reasoning"));
    expect(exaHits.length).toBe(EXA_BUDGET.reasoning);
  });

  it("does not cap when calls stay under budget", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2.5", [
        { id: "x1", name: "exa_search", args: { query: "q1" } },
        { id: "x2", name: "exa_search", args: { query: "q2" } },
        { id: "x3", name: "exa_search", args: { query: "q3" } },
      ]),
      stopResponse("kimi-k2.5"),
    ];
    await runKimi(makeArgs("default"));
    expect(exaHits.length).toBe(3);
  });
});

describe("Kimi adapter — error mapping", () => {
  it("maps 401 to auth_error", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    nextCreateError = Object.assign(new Error("Unauthorized"), { status: 401 });
    await expect(runKimi(makeArgs("default"))).rejects.toMatchObject({
      category: "auth_error",
    });
  });

  it("maps 429 to rate_limit (after withRetry exhausts)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    persistentCreateError = Object.assign(new Error("Rate"), { status: 429 });
    vi.useFakeTimers();
    try {
      const promise = runKimi(makeArgs("default"));
      const expectation = expect(promise).rejects.toMatchObject({ category: "rate_limit" });
      await vi.runAllTimersAsync();
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps AbortError to timeout (after withRetry exhausts)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    persistentCreateError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.useFakeTimers();
    try {
      const promise = runKimi(makeArgs("default"));
      const expectation = expect(promise).rejects.toMatchObject({ category: "timeout" });
      await vi.runAllTimersAsync();
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Kimi adapter — invariants", () => {
  it("throws model_error if exaKey is null", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    await expect(
      runKimi({
        config: {
          provider: "kimi",
          searchBackend: "exa",
          llmKey: "km-test",
          exaKey: null,
        },
        tier: "default",
        prompt: "x",
        schema: SimpleSchema,
        cacheKey: "founderscope:section:snapshot",
      }),
    ).rejects.toMatchObject({
      category: "model_error",
      message: expect.stringMatching(/Kimi adapter requires an EXA key/),
    });
  });
});
