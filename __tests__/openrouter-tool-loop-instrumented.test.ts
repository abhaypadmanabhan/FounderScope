// Instrumentation, not mocking. Every other test in this repo replaces
// `generateText`; this one keeps the real SDK loop and replaces only the model
// underneath it with MockLanguageModelV3. That makes it possible to see what
// the SDK actually sends per step — tools, responseFormat, and the exact bytes
// of the tool result the model reads back — which is the thing five live runs
// could not show.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

// `ai` ships its own nested copy of @ai-sdk/provider, so the V3 result type a
// test can name is not the one the runtime uses — the two disagree on the shape
// of `usage`. The mock config is cast once per mock rather than annotated.
type MockConfig = ConstructorParameters<typeof MockLanguageModelV3>[0];
import { z } from "zod";

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

// Only the model factory is swapped. The tool loop, Output handling, step
// accounting and tool-result serialisation are all the real SDK.
let mockModel: MockLanguageModelV3;
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => mockModel,
}));

import { runResearchCall } from "@/lib/llm";

// The shape of a real section: a summary plus grounded claims. Matching the
// live schemas matters — the empty-section symptom is `claims: []`.
const sectionSchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      id: z.number(),
      text: z.string(),
      citation_url: z.string().nullable(),
    }),
  ),
});

const config = {
  openrouterKey: "sk-or-v1-test",
  searchKey: "exa-test",
  searchProvider: "exa" as const,
};

// Shaped exactly like the orchestrator's live probe of the real EXA provider.
const EXA_HITS = [
  {
    title: "About — Linear",
    url: "https://linear.app/about",
    highlights: ["Linear was founded in 2019 by Karri Saarinen, Jori Lallo and Tuomas Artman."],
  },
  {
    title: "Linear raises Series B",
    url: "https://linear.app/blog/series-b",
    highlights: ["Linear raised a $35M Series B led by Accel."],
  },
  {
    title: "Linear on Crunchbase",
    url: "https://www.crunchbase.com/organization/linear",
    highlights: ["Issue tracking tool for software teams."],
  },
];

interface StepRecord {
  hasTools: boolean;
  toolNames: string[];
  responseFormat: unknown;
  toolResultTexts: string[];
}

const steps: StepRecord[] = [];
const originalFetch = global.fetch;

/** Pull the tool-result payloads the SDK put into this step's prompt. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolResultsIn(prompt: any[]): string[] {
  const out: string[] = [];
  for (const message of prompt ?? []) {
    if (message.role !== "tool") continue;
    for (const part of message.content ?? []) {
      const value = part.output?.value ?? part.output;
      out.push(typeof value === "string" ? value : JSON.stringify(value));
    }
  }
  return out;
}

beforeEach(() => {
  steps.length = 0;
  global.fetch = vi.fn(async () =>
    Response.json({ results: EXA_HITS }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

/**
 * A cooperative model: calls web_search once, then answers with the section
 * JSON. Records what the SDK handed it on each step.
 */
function scriptedModel(finalObject: unknown): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: async (options: any) => {
      call++;
      steps.push({
        hasTools: Array.isArray(options.tools) && options.tools.length > 0,
        toolNames: (options.tools ?? []).map(
          (t: { name?: string }) => t.name ?? "",
        ),
        responseFormat: options.responseFormat,
        toolResultTexts: toolResultsIn(options.prompt),
      });

      if (call === 1) {
        return {
          finishReason: "tool-calls" as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "call-1",
              toolName: "web_search",
              input: JSON.stringify({ query: "Linear app founders", num_results: 3 }),
            },
          ],
          warnings: [],
        };
      }

      return {
        finishReason: "stop" as const,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [{ type: "text" as const, text: JSON.stringify(finalObject) }],
        warnings: [],
      };
    },
  } as unknown as MockConfig);
}

const POPULATED = {
  summary: "Linear builds issue tracking for software teams.",
  claims: [
    {
      id: 1,
      text: "Linear was founded in 2019 by Karri Saarinen, Jori Lallo and Tuomas Artman.",
      citation_url: "https://linear.app/about",
    },
  ],
};

describe("what the SDK actually sends the model", () => {
  it("puts the tool result on the wire as {\"results\":[…]}, exactly what the prompts expect", async () => {
    mockModel = scriptedModel(POPULATED);

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "Research Linear.",
      schema: sectionSchema,
    });

    // Step 2 is the one that reads the tool result.
    expect(steps).toHaveLength(2);
    const [toolResultText] = steps[1].toolResultTexts;
    expect(toolResultText).toBeDefined();

    const parsed = JSON.parse(toolResultText);
    // The contract the section prompts were tuned on: an object with a
    // `results` key, not a bare array and not an error blob.
    expect(Array.isArray(parsed)).toBe(false);
    expect(Object.keys(parsed)).toEqual(["results"]);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[0]).toEqual({
      title: "About — Linear",
      url: "https://linear.app/about",
      highlights: [
        "Linear was founded in 2019 by Karri Saarinen, Jori Lallo and Tuomas Artman.",
      ],
    });
    expect(parsed.error).toBeUndefined();

    expect(result.data).toEqual(POPULATED);
  });

  it("counts the search in RunResult.usage", async () => {
    mockModel = scriptedModel(POPULATED);

    const result = await runResearchCall({
      config,
      tier: "default",
      prompt: "Research Linear.",
      schema: sectionSchema,
    });

    expect(result.usage).toEqual({
      calls: 1,
      cacheHits: 0,
      rateLimit429s: 0,
      fallbackHits: 0,
    });
    expect(result.usage?.calls).not.toBe(0);
  });

  it("registers the tool under the name the prompts use", async () => {
    mockModel = scriptedModel(POPULATED);
    await runResearchCall({
      config,
      tier: "default",
      prompt: "Research Linear.",
      schema: sectionSchema,
    });

    expect(steps[0].hasTools).toBe(true);
    expect(steps[0].toolNames).toEqual(["web_search"]);
  });
});

describe("the empty-section mechanism", () => {
  // THE FINDING, now a regression guard. Output.object sets responseFormat to a
  // strict json_schema and the SDK attaches it to EVERY step, including the one
  // where tools are offered (ai/dist/index.mjs:4738). A model under a strict
  // response format has one legal move — emit an object matching the schema —
  // so it cannot emit a tool call. gemini-3.1-flash-lite complied immediately
  // and returned schema-valid objects with empty arrays, which is exactly what
  // six default-tier sections did on the fifth live run.
  it("does NOT force a response format on a step that offers tools", async () => {
    mockModel = scriptedModel(POPULATED);
    await runResearchCall({
      config,
      tier: "default",
      prompt: "Research Linear.",
      schema: sectionSchema,
    });

    const firstStep = steps[0];
    expect(firstStep.hasTools).toBe(true);
    // The model must be free to answer with a tool call on this step.
    const format = firstStep.responseFormat as { type?: string } | undefined;
    expect(format?.type).not.toBe("json");
  });

  it("still forces the schema when there are no tools to suppress", async () => {
    mockModel = new MockLanguageModelV3({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doGenerate: async (options: any) => {
        steps.push({
          hasTools: Array.isArray(options.tools) && options.tools.length > 0,
          toolNames: [],
          responseFormat: options.responseFormat,
          toolResultTexts: [],
        });
        return {
          finishReason: "stop" as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: "text" as const, text: JSON.stringify(POPULATED) }],
          warnings: [],
        };
      },
    } as unknown as MockConfig);

    await runResearchCall({
      config,
      tier: "default",
      prompt: "Research Linear.",
      schema: sectionSchema,
      tools: "none",
    });

    expect(steps[0].hasTools).toBe(false);
    expect((steps[0].responseFormat as { type?: string })?.type).toBe("json");
  });

  // Independent of our code: proves the SDK behaviour that motivated the
  // change, so the reasoning above is checkable rather than asserted.
  it("SDK behaviour: Output.object + tools forces json on the tool step", async () => {
    const { generateText, Output, tool, stepCountIs } = await import("ai");
    const seen: Array<{ hasTools: boolean; responseFormat: unknown }> = [];

    const probe = new MockLanguageModelV3({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doGenerate: async (options: any) => {
        seen.push({
          hasTools: Array.isArray(options.tools) && options.tools.length > 0,
          responseFormat: options.responseFormat,
        });
        return {
          finishReason: "stop" as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: "text" as const, text: '{"ok":true}' }],
          warnings: [],
        };
      },
    } as unknown as MockConfig);

    await generateText({
      model: probe,
      prompt: "hi",
      tools: {
        web_search: tool({
          description: "search",
          inputSchema: z.object({ query: z.string() }),
          execute: async () => "{}",
        }),
      },
      output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
      stopWhen: stepCountIs(3),
    });

    expect(seen[0].hasTools).toBe(true);
    expect((seen[0].responseFormat as { type?: string })?.type).toBe("json");
  });

  it("reproduces the live symptom: a compliant model answers immediately and never searches", async () => {
    // A model that obeys the response_format on step 1 — no tool call, just a
    // schema-valid object. Nothing errors. Nothing times out. No steps are
    // exhausted. The section is simply empty.
    mockModel = new MockLanguageModelV3({
      doGenerate: async () => ({
        finishReason: "stop" as const,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ summary: "", claims: [] }),
          },
        ],
        warnings: [],
      }),
    } as unknown as MockConfig);

    const err = await runResearchCall({
      config,
      tier: "default",
      prompt: "Research Linear.",
      schema: sectionSchema,
    }).catch((e) => e);

    // Before b4 this was reported as a success. Now it fails loudly, and the
    // message says the model never searched.
    expect(err.message).toContain("zero claims");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
