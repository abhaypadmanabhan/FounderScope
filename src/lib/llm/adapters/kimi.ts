// Kimi adapter — runs against Moonshot's OpenAI-compatible endpoint
// (https://api.moonshot.ai/v1) using the `openai` SDK. Tool surface is
// EXA only; Kimi's $web_search builtin is intentionally rejected (see
// docs/superpowers/specs/2026-05-10-kimi-k26-optimization-design.md).
//
// selectProvider() guarantees exaKey is set when execution reaches here.
import OpenAI from "openai";
import type { RunArgs, RunResult, ModelTier } from "../types";
import { EXA_BUDGET } from "../types";
import { ResearchError } from "../errors";
import {
  handleExaSearch,
  openaiExaToolDef,
  createExaUsage,
  type ExaUsage,
} from "../tools/exa-search";
import { mapOpenAIError, parseFinalOpenAI, withRetry, type OpenAIChatCompletionLike } from "../shared";

const TIMEOUT_MS = 120_000;
const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
const MAX_TURNS = 16;
const isDev = process.env.NODE_ENV !== "production";

interface TierConfig {
  model: string;
  max_tokens: number;
  temperature?: number;
  thinking?: { type: "enabled" };
}

function tierConfig(tier: ModelTier): TierConfig {
  if (tier === "reasoning") {
    return {
      model: "kimi-k2.6",
      max_tokens: 16384,
      thinking: { type: "enabled" },
    };
  }
  // Default tier is kimi-k2.5 per spec fallback note: kimi-k2-0905-preview
  // returned 404 from Moonshot's /v1/models on smoke test (2026-05-10) and
  // the spec ("K2.5 stays as a fallback if K2-0905 has stability issues")
  // anticipated this. K2.5 has the same pricing and a 262k context window.
  //
  // K2.5 carries `supports_reasoning: true` and rejects custom temperature
  // ("only 1 is allowed for this model"), so we omit the field — same posture
  // as the reasoning tier. Strict json_schema + prompt_cache_key still apply.
  return {
    model: "kimi-k2.5",
    max_tokens: 8192,
  };
}

const EXA_BUDGET_EXHAUSTED_RESULT = JSON.stringify({
  error: "exa_search budget exhausted",
  message:
    "Write your final JSON answer now using prior search results. Do not call exa_search again.",
  results: [],
});

export async function runKimi<T>(args: RunArgs<T>): Promise<RunResult<T>> {
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
  const { config, tier, prompt, schema, cacheKey } = args;
  const cfg = tierConfig(tier);

  const client = new OpenAI({
    apiKey: config.llmKey,
    baseURL: KIMI_BASE_URL,
    maxRetries: 0,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // NO response_format. A live probe (2026-06-18) showed kimi-k2.5 serializes
  // tool calls into message *content* (finish_reason=stop, empty tool_calls)
  // whenever ANY response_format is set — strict json_schema OR json_object.
  // Sections always expose the EXA tool, so forcing a response format breaks
  // the research loop entirely. Instead we convey the schema via the prompt
  // (buildSectionPrompt embeds it) and validate the reply in parseFinalOpenAI
  // (JSON.parse → extractJson fallback → Zod). This mirrors the Anthropic path,
  // which has never used a strict response format either. `schema` stays the
  // source of truth for validation; it is not sent to the API.
  const tools = [openaiExaToolDef()];
  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: prompt },
  ];

  let response!: OpenAIChatCompletionLike;
  let safety = 0;
  const exaBudget = { used: 0 };
  const usage: ExaUsage = createExaUsage();

  try {
    while (true) {
      safety++;
      if (safety > MAX_TURNS) {
        throw new ResearchError("model_error", "exceeded max tool turns", {});
      }

      const params: Record<string, unknown> = {
        model: cfg.model,
        max_tokens: cfg.max_tokens,
        messages,
        tools,
      };
      if (cfg.temperature !== undefined) params.temperature = cfg.temperature;
      if (cfg.thinking) params.thinking = cfg.thinking;
      if (cacheKey) params.prompt_cache_key = cacheKey;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = (await client.chat.completions.create(params as any, {
          signal: controller.signal,
        })) as unknown as OpenAIChatCompletionLike;
      } catch (err) {
        throw mapOpenAIError(err, "Kimi", TIMEOUT_MS);
      }

      const choice = response.choices?.[0];
      const finish = choice?.finish_reason;
      const message = choice?.message;

      if (finish === "stop") {
        break;
      }
      if (finish === "length") {
        if (isDev) {
          console.warn("[kimi] finish_reason=length — max_tokens reached, output likely truncated", {
            model: cfg.model,
            max_tokens: cfg.max_tokens,
          });
        }
        break;
      }

      if (finish === "tool_calls") {
        const toolCalls = message?.tool_calls ?? [];
        if (toolCalls.length === 0) {
          throw new ResearchError(
            "model_error",
            "Kimi returned finish_reason=tool_calls with no tool_calls",
            {},
          );
        }
        const offending = toolCalls.find((c) => c.function.name !== "exa_search");
        if (offending) {
          if (isDev) {
            console.error("[kimi] model_error unexpected tool_use", {
              model: cfg.model,
              offendingName: offending.function.name,
              toolCallNames: toolCalls.map((c) => c.function.name),
            });
          }
          throw new ResearchError(
            "model_error",
            `Kimi invoked unsupported tool: ${offending.function.name}`,
            {},
          );
        }

        // Moonshot K2.6 with thinking enabled returns `reasoning_content` on the
        // assistant message and rejects subsequent requests if it isn't echoed
        // back on every tool_calls turn ("thinking is enabled but
        // reasoning_content is missing in assistant tool call message"). The
        // field is a Moonshot extension and not typed on OpenAI's SDK.
        const echoed: Record<string, unknown> = {
          role: "assistant",
          content: message?.content ?? null,
          tool_calls: toolCalls,
        };
        if (cfg.thinking) {
          const rc = (message as { reasoning_content?: unknown } | undefined)
            ?.reasoning_content;
          if (typeof rc === "string" && rc.length > 0) {
            echoed.reasoning_content = rc;
          }
        }
        messages.push(echoed);

        const budget = EXA_BUDGET[tier];
        const toolReplies = await Promise.all(
          toolCalls.map(async (call, idx) => {
            const callNumber = exaBudget.used + idx;
            if (callNumber >= budget) {
              return {
                role: "tool" as const,
                tool_call_id: call.id,
                content: EXA_BUDGET_EXHAUSTED_RESULT,
              };
            }
            let parsedArgs: { query: string; num_results?: number };
            try {
              parsedArgs = JSON.parse(call.function.arguments) as typeof parsedArgs;
            } catch {
              parsedArgs = { query: "" };
            }
            const content = await handleExaSearch(parsedArgs, config.exaKey!, usage);
            return {
              role: "tool" as const,
              tool_call_id: call.id,
              content,
            };
          }),
        );
        exaBudget.used += Math.min(
          toolCalls.length,
          Math.max(0, budget - exaBudget.used),
        );

        for (const reply of toolReplies) {
          messages.push(reply);
        }
        continue;
      }

      // Other finish_reasons fall through to parseFinalOpenAI for diagnosis.
      break;
    }
  } finally {
    clearTimeout(timer);
  }

  const result = parseFinalOpenAI(response, schema, cfg.model, "kimi");
  return { ...result, usage };
}
