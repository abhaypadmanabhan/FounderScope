// Anthropic adapter must accept args.cacheKey and pass it nowhere — no
// cache_control blocks, no extra params on the SDK call. Locks regression risk.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

const sdkCallParams: unknown[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIErr extends Error {}
  class AuthenticationError extends APIErr {}
  class RateLimitError extends APIErr {}
  class APIError extends APIErr {}
  class APIUserAbortError extends APIErr {
    name = "AbortError";
  }
  class MockAnthropic {
    beta: {
      messages: {
        create: (params: unknown) => Promise<unknown>;
      };
    };
    constructor(_opts: unknown) {
      this.beta = {
        messages: {
          create: async (params: unknown) => {
            sdkCallParams.push(params);
            return {
              model: "claude-haiku-4-5",
              stop_reason: "end_turn",
              content: [{ type: "text", text: '{"ok":true}' }],
            };
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

import { runAnthropic } from "@/lib/llm/adapters/anthropic";

describe("Anthropic adapter — cacheKey is a silent no-op", () => {
  it("does not pass prompt_cache_key, cache_control, or any cache field to the SDK", async () => {
    sdkCallParams.length = 0;
    const result = await runAnthropic({
      config: {
        provider: "anthropic",
        searchBackend: "native",
        llmKey: "sk-test",
        exaKey: null,
      },
      tier: "default",
      prompt: "any prompt",
      schema: z.object({ ok: z.boolean() }),
      cacheKey: "founderscope:section:snapshot",
    });
    expect(result.data).toEqual({ ok: true });
    expect(sdkCallParams).toHaveLength(1);
    const params = sdkCallParams[0] as Record<string, unknown>;
    const flat = JSON.stringify(params);
    expect(flat).not.toContain("prompt_cache_key");
    expect(flat).not.toContain("cache_control");
    expect(flat).not.toContain("founderscope");
  });
});
