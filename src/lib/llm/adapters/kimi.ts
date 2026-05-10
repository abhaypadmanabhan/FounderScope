// Kimi K2.6 via the Anthropic-compat endpoint at api.moonshot.ai. Tool surface
// is exa_search only — Kimi doesn't expose Anthropic's server-side web_search
// or code_execution. selectProvider() guarantees exaKey is set when we get here.
//
// Model ID + baseURL source:
//   Model ID "kimi-k2.6" confirmed at https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart
//   (verified 2026-05-10; docs show "model": "kimi-k2.6" in all code examples).
//   Plan placeholder used "kimi-k2-6" (hyphen) — corrected to "kimi-k2.6" (dot) per docs.
//
//   BaseURL "https://api.moonshot.ai/anthropic" is the plan placeholder. The public
//   quickstart page only documents the OpenAI-compat endpoint (api.moonshot.ai/v1).
//   The Anthropic-compat endpoint is referenced in the design spec at
//   docs/superpowers/specs/2026-05-10-kimi-exa-support-design.md (line ~194):
//   "https://api.moonshot.ai/anthropic/v1/messages", which means the baseURL to
//   pass to the Anthropic SDK (which appends /v1/messages itself) is
//   "https://api.moonshot.ai/anthropic". This matches the plan placeholder exactly.
//   NOTE: Requires a live smoke-test against Moonshot's API to confirm the endpoint
//   is active before merging Phase 1. See CONCERNS in Bundle 3 report.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { RunArgs, RunResult, ModelTier } from "../types";
import { ResearchError } from "../errors";
import { EXA_SEARCH_TOOL, handleExaSearch } from "../tools/exa-search";
import { parseFinal, mapSdkError, withRetry } from "../shared";

const TIMEOUT_MS = 60_000;
const KIMI_BASE_URL = "https://api.moonshot.ai/anthropic";
const isDev = process.env.NODE_ENV !== "production";

// Single tier — Kimi K2.6 is the flagship across the board. If quality on moat
// sections drops we can add a tier-specific switch later.
const MODELS: Record<ModelTier, string> = {
  default: "kimi-k2.6",   // confirmed at platform.kimi.ai/docs/guide/kimi-k2-6-quickstart (2026-05-10)
  reasoning: "kimi-k2.6", // same model for both tiers; Kimi K2.6 has no separate reasoning variant
};

function maxTokensFor(tier: ModelTier): number {
  return tier === "reasoning" ? 16384 : 8192;
}

export async function runKimi<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  // Invariant: selectProvider should have rejected Kimi without EXA before reaching here.
  if (!args.config.exaKey) {
    throw new ResearchError(
      "model_error",
      "Kimi adapter requires an EXA key (selectProvider should have rejected this earlier)",
      {},
    );
  }

  return withRetry(() => doCall(args));
}

async function doCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const { config, tier, prompt, schema } = args;
  const model = MODELS[tier];
  const maxTokens = maxTokensFor(tier);

  const client = new Anthropic({
    apiKey: config.llmKey,
    baseURL: KIMI_BASE_URL,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const tools = [EXA_SEARCH_TOOL];
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: prompt },
  ];

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
          {
            model,
            max_tokens: maxTokens,
            tools,
            messages,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          { signal: controller.signal },
        );
      } catch (err) {
        throw mapSdkError(err, "Kimi", TIMEOUT_MS);
      }

      if (
        response.stop_reason === "end_turn" ||
        response.stop_reason === "stop_sequence"
      ) {
        break;
      }

      if (response.stop_reason === "tool_use") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blocks = (response.content ?? []) as any[];
        const exaCalls = blocks.filter(
          (b) => b.type === "tool_use" && b.name === "exa_search",
        );

        if (exaCalls.length === 0) {
          // Kimi invoked a tool other than exa_search — unexpected.
          const offendingNames = blocks
            .filter((b) => b.type === "tool_use")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((b: any) => b.name as string);
          if (isDev) {
            console.error("[kimi] model_error unexpected tool_use", {
              model,
              offendingNames,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              contentBlockTypes: blocks.map((b: any) => b.type),
            });
          }
          throw new ResearchError(
            "model_error",
            `Kimi invoked unsupported tool(s): ${offendingNames.join(", ")}`,
            {},
          );
        }

        const toolResults = await Promise.all(
          exaCalls.map(async (call) => ({
            type: "tool_result",
            tool_use_id: call.id,
            content: await handleExaSearch(call.input, config.exaKey!),
          })),
        );
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // max_tokens, refusal, or other stop reason — exit loop.
      break;
    }
  } finally {
    clearTimeout(timer);
  }

  return parseFinal(response, schema, model, "kimi");
}
