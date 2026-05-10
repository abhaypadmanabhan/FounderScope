// Anthropic adapter — runs a section call against api.anthropic.com.
// When searchBackend === "exa", we drop native web_search from the tools list
// and intercept exa_search tool_use blocks ourselves. When searchBackend === "native",
// behavior matches the legacy lib/anthropic.ts to keep regression tests passing.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { RunArgs, RunResult, ModelTier } from "../types";
import { ResearchError } from "../errors";
import { EXA_SEARCH_TOOL, handleExaSearch } from "../tools/exa-search";
import { parseFinal, mapSdkError, withRetry } from "../shared";

const TIMEOUT_MS = 60_000;
const DYNAMIC_FILTERING_BETA = "code-execution-web-tools-2026-02-09";
const isDev = process.env.NODE_ENV !== "production";

const MODELS: Record<ModelTier, string> = {
  default: "claude-haiku-4-5",
  reasoning: "claude-opus-4-7",
};

function maxTokensFor(tier: ModelTier): number {
  return tier === "reasoning" ? 16384 : 8192;
}

export async function runAnthropic<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  return withRetry(() => doCall(args));
}

async function doCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const { config, tier, prompt, schema } = args;
  const model = MODELS[tier];
  const useReasoning = tier === "reasoning";
  const maxTokens = maxTokensFor(tier);

  const client = new Anthropic({ apiKey: config.llmKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const tools = buildTools(args, useReasoning);
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: prompt },
  ];

  const baseArgs: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    tools,
    messages,
    ...(useReasoning ? { betas: [DYNAMIC_FILTERING_BETA] } : {}),
  };

  // eslint-disable-next-line prefer-const
  let response!: BetaMessage;
  let safety = 0;
  const MAX_TURNS = 12;

  try {
    while (true) {
      safety++;
      if (safety > MAX_TURNS) {
        throw new ResearchError("model_error", "exceeded max tool turns", {});
      }

      try {
        response = await client.beta.messages.create(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          baseArgs as any,
          { signal: controller.signal },
        );
      } catch (err) {
        throw mapSdkError(err, "Anthropic", TIMEOUT_MS);
      }

      if (
        response.stop_reason === "end_turn" ||
        response.stop_reason === "stop_sequence"
      ) {
        break;
      }

      if (response.stop_reason === "tool_use") {
        const handled = await handleToolUse(response, config.exaKey, messages);
        if (handled === "unknown_tool") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const unknown = response.content?.find((b: any) => b.type === "tool_use" && b.name !== "web_search" && b.name !== "code_execution");
          if (isDev) {
            console.error("[anthropic] model_error stop_reason=tool_use", {
              model,
              finalStopReason: response.stop_reason,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              contentBlockTypes: response.content?.map((b: any) => b.type),
              lastTextBlock: response.content
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?.filter((b: any) => b.type === "text")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?.map((b: any) => b.text?.slice(0, 400))
                ?.join("\n---\n"),
            });
          }
          throw new ResearchError(
            "model_error",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `unexpected client-side tool_use: ${(unknown as any)?.name}`,
            {},
          );
        }
        // Both "server_handled" (web_search/code_execution) and "exa_handled" —
        // messages already mutated in handleToolUse, loop continues.
        continue;
      }

      break; // max_tokens, refusal, etc.
    }
  } finally {
    clearTimeout(timer);
  }

  return parseFinal(response, schema, model, "anthropic");
}

function buildTools(args: RunArgs<unknown>, useReasoning: boolean) {
  const exa = args.config.searchBackend === "exa";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [];

  if (!exa) {
    // Native web_search: version depends on tier (reasoning tier uses the newer beta version).
    tools.push({
      type: useReasoning ? "web_search_20260209" : "web_search_20250305",
      name: "web_search",
      max_uses: 8,
    });
  }

  if (!useReasoning) {
    // Reasoning beta (DYNAMIC_FILTERING_BETA) auto-injects code_execution.
    // Explicit declaration would collide on tool name — only declare when beta is OFF.
    tools.push({ type: "code_execution_20250522", name: "code_execution" });
  }

  if (exa) {
    tools.push(EXA_SEARCH_TOOL);
  }

  return tools;
}

// Allowed client-side tool names. Any tool_use block with a name outside this
// set in a stop_reason=tool_use response is an unexpected client-side tool and
// must be rejected before processing — otherwise its tool_result would be
// silently dropped and the next API call would fail.
const ALLOWED_TOOL_NAMES = new Set(["exa_search", "web_search", "code_execution"]);

async function handleToolUse(
  response: BetaMessage,
  exaKey: string | null,
  messages: Array<{ role: string; content: unknown }>,
): Promise<"server_handled" | "exa_handled" | "unknown_tool"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = (response.content ?? []) as any[];

  // Guard: reject any unknown tool before any processing. If the response
  // contains both an exa_search block and an unknown tool, we still reject —
  // the unknown tool's tool_result would be silently dropped otherwise.
  const unknownBlock = blocks.find(
    (b) => b.type === "tool_use" && !ALLOWED_TOOL_NAMES.has(b.name),
  );
  if (unknownBlock) return "unknown_tool";

  const exaCalls = blocks.filter((b) => b.type === "tool_use" && b.name === "exa_search");

  if (exaCalls.length > 0) {
    if (!exaKey) {
      throw new ResearchError(
        "model_error",
        "model invoked exa_search but no EXA key was configured",
        {},
      );
    }
    const toolResults = await Promise.all(
      exaCalls.map(async (call) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: await handleExaSearch(call.input, exaKey),
      })),
    );
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
    return "exa_handled";
  }

  // Anthropic-handled (web_search / code_execution): Anthropic's server inlines the
  // tool results into the next response automatically. We just append the assistant
  // message and loop — no client-side tool_result needed.
  messages.push({ role: "assistant", content: response.content });
  return "server_handled";
}
