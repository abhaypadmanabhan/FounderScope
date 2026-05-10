# Kimi + EXA Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kimi K2.6 as a second LLM provider and EXA as a custom web-search function tool, selected automatically by which keys the user has configured.

**Architecture:** New `src/lib/llm/` namespace with a provider selector, two adapters (Anthropic, Kimi), and an EXA-backed custom function tool. Existing `src/lib/anthropic.ts` becomes a thin re-export so callers don't move all at once. Sections lose their hardcoded `model` + `webSearchVersion` fields and gain a `tier: "default" | "reasoning"` that adapters resolve.

**Tech Stack:** Next.js 14, TypeScript strict, `@anthropic-ai/sdk` (used by both Anthropic and Kimi via baseURL override), Zod, vitest. New runtime dep: `exa-js` (or raw `fetch` to `https://api.exa.ai/search`).

**Spec:** `docs/superpowers/specs/2026-05-10-kimi-exa-support-design.md`

---

## File Structure

**Create:**
- `src/lib/llm/types.ts` — `ProviderId`, `SearchBackend`, `ModelTier`, `RunArgs`, `ProviderConfig`, `Keys`
- `src/lib/llm/provider.ts` — `selectProvider(keys)` routing function
- `src/lib/llm/index.ts` — public `runResearchCall(args)` that dispatches to the right adapter
- `src/lib/llm/adapters/anthropic.ts` — current `runResearchCall` body, parameterized by search backend
- `src/lib/llm/adapters/kimi.ts` — Anthropic SDK with baseURL override, EXA-only search
- `src/lib/llm/tools/exa-client.ts` — `exaSearch(query, opts, apiKey)` over `POST https://api.exa.ai/search`
- `src/lib/llm/tools/exa-search.ts` — `EXA_SEARCH_TOOL` definition + `handleExaSearch(input, key)` handler
- `__tests__/provider-select.test.ts` — routing matrix coverage
- `__tests__/exa-client.test.ts` — fetch mock, request shape, response parsing
- `__tests__/exa-search-tool.test.ts` — handler returns expected stringified payload

**Modify:**
- `src/lib/anthropic.ts` — replace body with `export * from "./llm";`
- `src/lib/sections/types.ts` — `SectionDefinition` gets `tier`, drops `model` + `webSearchVersion`; add `ModelTier` re-export
- `src/lib/sections/{snapshot,moat,founders,tech-stack,funding,traction,market}.tsx` — replace `model: ..., webSearchVersion: ...` with `tier: "default" | "reasoning"`
- `src/lib/disambiguate.ts` — import `runResearchCall` from `@/lib/llm` (path-only change)
- `src/app/api/research/route.ts` — read `x-anthropic-key`, `x-kimi-key`, `x-exa-key`; call `selectProvider`; return `400 missing_search_key` when Kimi alone
- `src/app/company/[slug]/page.tsx` — extend `handleEvent` to surface new error codes; read all 3 keys from `localStorage` and forward as headers
- `src/app/settings/page.tsx` — add Kimi + EXA inputs and a "Active routing" status line
- `__tests__/research.test.ts` — update tier→model assertions after Phase 2; add Kimi+EXA happy-path test in Phase 3
- `package.json` — `exa-js` dep (optional; raw fetch also fine)

**Test:** All tests in `__tests__/`. Vitest config at `vitest.config.ts`, alias `@` → `src/`.

---

## Phase 1 — Foundation (no behavior change)

This phase introduces the abstraction without altering the running app. After Phase 1 commits, `npm test` passes the existing `research.test.ts` as-is — that's the integration test for "Anthropic-only path is unchanged."

### Task 1: Create LLM types

**Files:**
- Create: `src/lib/llm/types.ts`

- [ ] **Step 1: Write the file**

```ts
// Provider abstraction types — section authors and route.ts depend on this surface.
import type { ZodType } from "zod";

export type ProviderId = "anthropic" | "kimi";
export type SearchBackend = "native" | "exa";
export type ModelTier = "default" | "reasoning";

export interface Keys {
  anthropic: string | null;
  kimi: string | null;
  exa: string | null;
}

export interface ProviderConfig {
  provider: ProviderId;
  searchBackend: SearchBackend;
  llmKey: string;
  exaKey: string | null;
}

export interface RunArgs<T> {
  config: ProviderConfig;
  tier: ModelTier;
  prompt: string;
  schema: ZodType<T>;
}

export interface RunResult<T> {
  data: T;
  raw: string;
  modelVersion: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit at end of Phase 1 (don't commit per-step in this phase)**

---

### Task 2: selectProvider — failing test

**Files:**
- Create: `__tests__/provider-select.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { selectProvider } from "@/lib/llm/provider";

describe("selectProvider", () => {
  it("Anthropic only → anthropic + native search", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: null, exa: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("native");
    expect(r.config.llmKey).toBe("sk-ant-1");
    expect(r.config.exaKey).toBeNull();
  });

  it("Anthropic + EXA → anthropic + exa", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: null, exa: "exa-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("exa");
    expect(r.config.exaKey).toBe("exa-1");
  });

  it("Anthropic + Kimi (no EXA) → anthropic + native (Kimi ignored)", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: "km-1", exa: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("native");
  });

  it("Anthropic + Kimi + EXA → anthropic + exa (Anthropic wins ties)", () => {
    const r = selectProvider({ anthropic: "sk-ant-1", kimi: "km-1", exa: "exa-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("anthropic");
    expect(r.config.searchBackend).toBe("exa");
  });

  it("Kimi + EXA → kimi + exa", () => {
    const r = selectProvider({ anthropic: null, kimi: "km-1", exa: "exa-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.provider).toBe("kimi");
    expect(r.config.searchBackend).toBe("exa");
    expect(r.config.llmKey).toBe("km-1");
    expect(r.config.exaKey).toBe("exa-1");
  });

  it("Kimi only → error missing_search_key", () => {
    const r = selectProvider({ anthropic: null, kimi: "km-1", exa: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_search_key");
  });

  it("no LLM key → error missing_api_key", () => {
    const r = selectProvider({ anthropic: null, kimi: null, exa: "exa-1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_api_key");
  });

  it("no keys at all → error missing_api_key", () => {
    const r = selectProvider({ anthropic: null, kimi: null, exa: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing_api_key");
  });
});
```

- [ ] **Step 2: Run test — should FAIL with "Cannot find module"**

Run: `npx vitest run __tests__/provider-select.test.ts`
Expected: FAIL ("Failed to resolve import @/lib/llm/provider").

---

### Task 3: selectProvider — implementation

**Files:**
- Create: `src/lib/llm/provider.ts`

- [ ] **Step 1: Write minimal impl that makes Task 2 pass**

```ts
// Auto-routes to a provider + search backend based on which keys the user supplied.
// Anthropic wins ties. Kimi requires EXA (its native web tool isn't compatible).
import type { Keys, ProviderConfig } from "./types";

export type SelectError = "missing_api_key" | "missing_search_key";

export type SelectResult =
  | { ok: true; config: ProviderConfig }
  | { ok: false; error: SelectError; message: string };

export function selectProvider(keys: Keys): SelectResult {
  if (keys.anthropic) {
    return {
      ok: true,
      config: {
        provider: "anthropic",
        searchBackend: keys.exa ? "exa" : "native",
        llmKey: keys.anthropic,
        exaKey: keys.exa,
      },
    };
  }
  if (keys.kimi) {
    if (!keys.exa) {
      return {
        ok: false,
        error: "missing_search_key",
        message:
          "Kimi requires an EXA key for web search. Add an EXA key in /settings or use an Anthropic key.",
      };
    }
    return {
      ok: true,
      config: {
        provider: "kimi",
        searchBackend: "exa",
        llmKey: keys.kimi,
        exaKey: keys.exa,
      },
    };
  }
  return {
    ok: false,
    error: "missing_api_key",
    message:
      "Provide an Anthropic or Kimi key in /settings (or x-anthropic-key / x-kimi-key header).",
  };
}
```

- [ ] **Step 2: Run test — should PASS**

Run: `npx vitest run __tests__/provider-select.test.ts`
Expected: 8 passing.

---

### Task 4: EXA client — failing test

**Files:**
- Create: `__tests__/exa-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  lastRequest = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async (url: any, init: any) => {
    lastRequest = { url: String(url), init };
    return new Response(
      JSON.stringify({
        results: [
          {
            title: "Stripe — payments infra",
            url: "https://stripe.com",
            highlights: ["Stripe builds payments APIs."],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { exaSearch } from "@/lib/llm/tools/exa-client";

describe("exaSearch", () => {
  it("posts to https://api.exa.ai/search with correct shape", async () => {
    await exaSearch({ query: "stripe", numResults: 5 }, "exa-test");
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.url).toBe("https://api.exa.ai/search");
    expect(lastRequest!.init.method).toBe("POST");
    const headers = new Headers(lastRequest!.init.headers as HeadersInit);
    expect(headers.get("x-api-key")).toBe("exa-test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(lastRequest!.init.body as string);
    expect(body.query).toBe("stripe");
    expect(body.type).toBe("auto");
    expect(body.numResults).toBe(5);
    expect(body.contents.highlights).toBe(true);
  });

  it("returns parsed { title, url, highlights } results", async () => {
    const out = await exaSearch({ query: "stripe" }, "exa-test");
    expect(out.results).toHaveLength(1);
    expect(out.results[0].title).toBe("Stripe — payments infra");
    expect(out.results[0].url).toBe("https://stripe.com");
    expect(out.results[0].highlights).toEqual(["Stripe builds payments APIs."]);
  });

  it("defaults numResults to 5 when omitted", async () => {
    await exaSearch({ query: "stripe" }, "exa-test");
    const body = JSON.parse(lastRequest!.init.body as string);
    expect(body.numResults).toBe(5);
  });

  it("throws on non-2xx", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn(async () => new Response("rate limit", { status: 429 })) as any;
    await expect(exaSearch({ query: "x" }, "exa-test")).rejects.toThrow(/EXA 429/);
  });
});
```

- [ ] **Step 2: Run test — should FAIL with module-not-found**

Run: `npx vitest run __tests__/exa-client.test.ts`
Expected: FAIL.

---

### Task 5: EXA client — implementation

**Files:**
- Create: `src/lib/llm/tools/exa-client.ts`

- [ ] **Step 1: Write minimal impl**

```ts
// Thin wrapper over POST https://api.exa.ai/search.
// We always use type=auto + contents.highlights=true; verbose text is too token-heavy
// for a tool-use loop and highlights give the model what it needs to summarize.
export interface ExaSearchInput {
  query: string;
  numResults?: number;
}

export interface ExaResult {
  title: string;
  url: string;
  highlights: string[];
}

export interface ExaSearchOutput {
  results: ExaResult[];
}

const EXA_ENDPOINT = "https://api.exa.ai/search";

export async function exaSearch(
  input: ExaSearchInput,
  apiKey: string,
): Promise<ExaSearchOutput> {
  const numResults = input.numResults ?? 5;
  const res = await fetch(EXA_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      type: "auto",
      numResults,
      contents: { highlights: true },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EXA ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; highlights?: string[] }>;
  };

  return {
    results: (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      highlights: r.highlights ?? [],
    })),
  };
}
```

- [ ] **Step 2: Run test — should PASS**

Run: `npx vitest run __tests__/exa-client.test.ts`
Expected: 4 passing.

---

### Task 6: EXA tool definition + handler — failing test

**Files:**
- Create: `__tests__/exa-search-tool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        results: [
          { title: "A", url: "https://a.example", highlights: ["a-hl"] },
          { title: "B", url: "https://b.example", highlights: ["b-hl"] },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { EXA_SEARCH_TOOL, handleExaSearch } from "@/lib/llm/tools/exa-search";

describe("EXA_SEARCH_TOOL", () => {
  it("declares the expected schema for the tool-use loop", () => {
    expect(EXA_SEARCH_TOOL.name).toBe("exa_search");
    expect(EXA_SEARCH_TOOL.input_schema.required).toEqual(["query"]);
    expect(EXA_SEARCH_TOOL.input_schema.properties.query.type).toBe("string");
    expect(EXA_SEARCH_TOOL.input_schema.properties.num_results.type).toBe("integer");
  });
});

describe("handleExaSearch", () => {
  it("returns a stringified payload the model can read", async () => {
    const out = await handleExaSearch({ query: "stripe" }, "exa-key");
    const parsed = JSON.parse(out);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toEqual({
      title: "A",
      url: "https://a.example",
      highlights: ["a-hl"],
    });
  });

  it("returns a stringified error on EXA failure rather than throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as any;
    const out = await handleExaSearch({ query: "x" }, "exa-key");
    const parsed = JSON.parse(out);
    expect(parsed.error).toMatch(/EXA 500/);
  });
});
```

- [ ] **Step 2: Run test — should FAIL with module-not-found**

Run: `npx vitest run __tests__/exa-search-tool.test.ts`
Expected: FAIL.

---

### Task 7: EXA tool — implementation

**Files:**
- Create: `src/lib/llm/tools/exa-search.ts`

- [ ] **Step 1: Write minimal impl**

```ts
// Custom function tool the model invokes inside the tool-use loop. The handler
// catches EXA failures and returns a stringified error blob so the model can
// decide whether to retry with a different query rather than crashing the section.
import { exaSearch, type ExaSearchInput } from "./exa-client";

export const EXA_SEARCH_TOOL = {
  type: "custom" as const,
  name: "exa_search",
  description:
    "Search the public web. Returns a list of {title, url, highlights} hits. " +
    "Use this for company facts, founder bios, funding rounds, news. " +
    "When you cite a fact in your output's `claims`, use the URL from these results.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const },
      num_results: { type: "integer" as const, default: 5, minimum: 1, maximum: 10 },
    },
    required: ["query"] as const,
  },
};

export async function handleExaSearch(
  input: { query: string; num_results?: number },
  exaKey: string,
): Promise<string> {
  const search: ExaSearchInput = {
    query: input.query,
    numResults: input.num_results,
  };
  try {
    const out = await exaSearch(search, exaKey);
    return JSON.stringify(out);
  } catch (err) {
    return JSON.stringify({
      error: (err as Error).message ?? "EXA call failed",
      results: [],
    });
  }
}
```

- [ ] **Step 2: Run test — should PASS**

Run: `npx vitest run __tests__/exa-search-tool.test.ts`
Expected: 3 passing.

---

### Task 8: Move existing Anthropic logic into adapter (no behavior change)

**Files:**
- Create: `src/lib/llm/adapters/anthropic.ts`
- Reference: `src/lib/anthropic.ts` (current full file — lift logic from here)

The current `runResearchCall` in `src/lib/anthropic.ts` already does what we want. We're moving its body into an adapter that takes the new `RunArgs` shape and that knows about `searchBackend`. The legacy file becomes a re-export in Task 11.

- [ ] **Step 1: Write the adapter**

```ts
// Anthropic adapter — runs a section call against api.anthropic.com.
// When searchBackend === "exa", we drop native web_search from the tools list
// and intercept exa_search tool_use blocks ourselves. When searchBackend === "native",
// behavior matches the legacy lib/anthropic.ts to keep regression tests passing.
import Anthropic from "@anthropic-ai/sdk";
import {
  AuthenticationError,
  RateLimitError,
  APIError,
  APIUserAbortError,
} from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaContentBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ZodError } from "zod";
import type { RunArgs, RunResult, ModelTier } from "../types";
import { ResearchError } from "../errors";
import { EXA_SEARCH_TOOL, handleExaSearch } from "../tools/exa-search";

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

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [2_000, 8_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ResearchError)) throw err;
      if (err.category !== "rate_limit" && err.category !== "timeout") throw err;
      if (attempt === delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
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
        throw mapAnthropicError(err);
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
          const unknown = response.content?.find((b: any) => b.type === "tool_use");
          throw new ResearchError(
            "model_error",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `unexpected client-side tool_use: ${(unknown as any)?.name}`,
            {},
          );
        }
        if (handled === "server_handled") continue;
        // exa handled — messages already mutated, loop again
        continue;
      }

      break; // max_tokens, refusal, etc.
    }
  } finally {
    clearTimeout(timer);
  }

  return parseFinal(response, schema, model);
}

function buildTools(args: RunArgs<unknown>, useReasoning: boolean) {
  const exa = args.config.searchBackend === "exa";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [];
  if (!exa) {
    tools.push({
      type: useReasoning ? "web_search_20260209" : "web_search_20250305",
      name: "web_search",
      max_uses: 8,
    });
  }
  if (!useReasoning) {
    // Reasoning beta auto-injects code_execution; explicit declaration collides.
    tools.push({ type: "code_execution_20250522", name: "code_execution" });
  }
  if (exa) {
    tools.push(EXA_SEARCH_TOOL);
  }
  return tools;
}

async function handleToolUse(
  response: BetaMessage,
  exaKey: string | null,
  messages: Array<{ role: string; content: unknown }>,
): Promise<"server_handled" | "exa_handled" | "unknown_tool"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = (response.content ?? []) as any[];
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

  const unknown = blocks.find(
    (b) =>
      b.type === "tool_use" &&
      b.name !== "web_search" &&
      b.name !== "code_execution",
  );
  if (unknown) return "unknown_tool";

  // Anthropic-handled (web_search / code_execution) — loop continues with the
  // server-side tool-use blocks already inlined into the next response by Anthropic.
  messages.push({ role: "assistant", content: response.content });
  return "server_handled";
}

function parseFinal<T>(
  response: BetaMessage,
  schema: import("zod").ZodType<T>,
  model: string,
): RunResult<T> {
  const finalText = (response.content ?? ([] as BetaContentBlock[]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text as string)
    .join("\n");

  if (!finalText.trim()) {
    if (isDev) {
      console.error("[anthropic] no text in final response", {
        model,
        stop_reason: response.stop_reason,
      });
    }
    throw new ResearchError("model_error", "no text in final response", {});
  }

  const cleaned = extractJson(finalText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new ResearchError("schema_validation", "Model output is not valid JSON", {
      raw: finalText,
      cause: err,
    });
  }

  try {
    const data = schema.parse(parsed);
    return { data, raw: finalText, modelVersion: response.model };
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ResearchError(
        "schema_validation",
        `Zod schema validation failed: ${err.message}`,
        { raw: finalText, cause: err },
      );
    }
    throw err;
  }
}

function mapAnthropicError(err: unknown): ResearchError {
  if (err instanceof APIUserAbortError || (err as { name?: string })?.name === "AbortError") {
    return new ResearchError("timeout", `Anthropic call timed out after ${TIMEOUT_MS}ms`, {
      cause: err,
    });
  }
  if (err instanceof AuthenticationError) {
    return new ResearchError("auth_error", "Invalid Anthropic API key", { cause: err });
  }
  if (err instanceof RateLimitError) {
    return new ResearchError("rate_limit", "Anthropic rate limit hit", { cause: err });
  }
  if (err instanceof APIError) {
    return new ResearchError(
      "model_error",
      `Anthropic API error: ${(err as Error).message}`,
      { cause: err },
    );
  }
  return new ResearchError(
    "model_error",
    `Unexpected Anthropic error: ${(err as Error)?.message ?? String(err)}`,
    { cause: err },
  );
}

function extractJson(text: string): string {
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const firstBrace = s.search(/[\{\[]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace > -1 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);
  return s;
}
```

- [ ] **Step 2: Create the shared error class file**

Create: `src/lib/llm/errors.ts`

```ts
export type ResearchErrorCategory =
  | "schema_validation"
  | "model_error"
  | "auth_error"
  | "rate_limit"
  | "timeout";

export class ResearchError extends Error {
  category: ResearchErrorCategory;
  raw?: string;
  cause?: unknown;
  constructor(
    category: ResearchErrorCategory,
    message: string,
    opts?: { raw?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "ResearchError";
    this.category = category;
    this.raw = opts?.raw;
    this.cause = opts?.cause;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 9: Kimi adapter

**Files:**
- Create: `src/lib/llm/adapters/kimi.ts`

Kimi K2.6 exposes an Anthropic-compatible endpoint (per Moonshot docs: `https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart`). The Kimi adapter is structurally identical to the Anthropic adapter except: (1) baseURL override, (2) different model IDs, (3) no native web_search / code_execution — only `exa_search`.

- [ ] **Step 1: Write the adapter**

```ts
// Kimi K2.6 via the Anthropic-compat endpoint at api.moonshot.ai. Tool surface
// is exa_search only — Kimi doesn't expose Anthropic's server-side web_search
// or code_execution. selectProvider() guarantees exaKey is set when we get here.
import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import type {
  BetaMessage,
  BetaContentBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { RunArgs, RunResult, ModelTier } from "../types";
import { ResearchError } from "../errors";
import { EXA_SEARCH_TOOL, handleExaSearch } from "../tools/exa-search";

const TIMEOUT_MS = 60_000;
const KIMI_BASE_URL = "https://api.moonshot.ai/anthropic"; // verify against Moonshot docs in Phase 1 smoke test

// Single tier — Kimi K2.6 is the flagship across the board. If quality on moat
// drops we'll add a tier-specific switch later.
// IMPORTANT: confirm the canonical model ID before merging this task.
// Moonshot's docs at platform.kimi.ai are the source of truth.
const MODELS: Record<ModelTier, string> = {
  default: "kimi-k2-6",
  reasoning: "kimi-k2-6",
};

function maxTokensFor(tier: ModelTier): number {
  return tier === "reasoning" ? 16384 : 8192;
}

export async function runKimi<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  const { config, tier, prompt, schema } = args;
  if (!config.exaKey) {
    throw new ResearchError(
      "model_error",
      "Kimi adapter requires an EXA key (selectProvider should have rejected this earlier)",
      {},
    );
  }
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
          throw new ResearchError(
            "model_error",
            `Kimi invoked unsupported tool: ${blocks
              .filter((b) => b.type === "tool_use")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((b: any) => b.name)
              .join(", ")}`,
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

      break;
    }
  } finally {
    clearTimeout(timer);
  }

  const finalText = (response.content ?? ([] as BetaContentBlock[]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text as string)
    .join("\n");

  if (!finalText.trim()) {
    throw new ResearchError("model_error", "no text in final response", {});
  }

  const cleaned = extractJson(finalText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new ResearchError("schema_validation", "Model output is not valid JSON", {
      raw: finalText,
      cause: err,
    });
  }
  try {
    const data = schema.parse(parsed);
    return { data, raw: finalText, modelVersion: response.model };
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ResearchError(
        "schema_validation",
        `Zod schema validation failed: ${err.message}`,
        { raw: finalText, cause: err },
      );
    }
    throw err;
  }
}

function extractJson(text: string): string {
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const firstBrace = s.search(/[\{\[]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace > -1 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);
  return s;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 10: Public LLM index — runResearchCall dispatch

**Files:**
- Create: `src/lib/llm/index.ts`

- [ ] **Step 1: Write the dispatcher**

```ts
// Public surface. Sections + route.ts import runResearchCall from here.
import type { RunArgs, RunResult } from "./types";
import { runAnthropic } from "./adapters/anthropic";
import { runKimi } from "./adapters/kimi";

export { selectProvider } from "./provider";
export type { SelectError, SelectResult } from "./provider";
export { ResearchError } from "./errors";
export type { ResearchErrorCategory } from "./errors";
export type {
  ProviderId,
  SearchBackend,
  ModelTier,
  Keys,
  ProviderConfig,
  RunArgs,
  RunResult,
} from "./types";

export async function runResearchCall<T>(args: RunArgs<T>): Promise<RunResult<T>> {
  switch (args.config.provider) {
    case "anthropic":
      return runAnthropic(args);
    case "kimi":
      return runKimi(args);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 11: Backwards-compat shim — keep src/lib/anthropic.ts callers working

**Files:**
- Modify: `src/lib/anthropic.ts` (full replace)

The legacy `runResearchCall` signature took `{ apiKey, model, webSearchVersion, prompt, schema }`. We keep that shape working temporarily so we can introduce the new abstraction without changing every caller in one commit. Phase 2 retires it.

- [ ] **Step 1: Replace the file**

```ts
// Compat shim. Adapts the legacy signature used by sections + route.ts to the
// new src/lib/llm surface. Phase 2 deletes this and updates callers directly.
import type { ZodType } from "zod";
import { runResearchCall as runNew } from "./llm";
import type { ModelTier, ProviderConfig } from "./llm";
import type { WebSearchToolVersion } from "./sections/types";

export { ResearchError } from "./llm";
export type { ResearchErrorCategory } from "./llm";

interface LegacyArgs<T> {
  apiKey: string;
  model: string;
  webSearchVersion: WebSearchToolVersion;
  prompt: string;
  schema: ZodType<T>;
}

export async function runResearchCall<T>(
  args: LegacyArgs<T>,
): Promise<{ data: T; raw: string; modelVersion: string }> {
  const tier: ModelTier =
    args.model === "claude-opus-4-7" ? "reasoning" : "default";
  const config: ProviderConfig = {
    provider: "anthropic",
    searchBackend: "native",
    llmKey: args.apiKey,
    exaKey: null,
  };
  return runNew({
    config,
    tier,
    prompt: args.prompt,
    schema: args.schema,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all 41 tests pass — `research.test.ts` exercises the legacy signature; if it passes, the shim is correct.

---

### Task 12: Phase 1 commit

- [ ] **Step 1: Build sanity**

Run: `npm run build 2>&1 | tail -10`
Expected: 6 routes, no errors.

- [ ] **Step 2: Stage + commit**

```bash
git add src/lib/llm src/lib/anthropic.ts \
  __tests__/provider-select.test.ts \
  __tests__/exa-client.test.ts \
  __tests__/exa-search-tool.test.ts
git commit -m "$(cat <<'EOF'
feat(llm): provider abstraction + Kimi adapter + EXA tool (no behavior change)

Introduces src/lib/llm/ with:
- selectProvider() — auto-routes (Anthropic | Kimi) × (native | EXA) by key presence
- adapters/anthropic.ts — current logic moved here; conditionally drops native
  web_search when EXA backend is active
- adapters/kimi.ts — Anthropic SDK with baseURL override, EXA-only tool surface
- tools/exa-search.ts + tools/exa-client.ts — POST /search with type=auto and
  contents.highlights=true, surfaced as a custom function tool

src/lib/anthropic.ts becomes a compat shim that translates the legacy
{apiKey, model, webSearchVersion} signature to the new ProviderConfig shape.
This keeps the existing Anthropic-only path bit-for-bit identical until Phase 2
retires the shim.

Existing __tests__/research.test.ts still passes — it exercises the shim,
which proves the legacy path is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Section tier refactor

Mechanical change to the seven section files plus the registry interface. After Phase 2, the legacy `model` and `webSearchVersion` strings are gone from the codebase.

### Task 13: Update SectionDefinition interface

**Files:**
- Modify: `src/lib/sections/types.ts:62-74`

- [ ] **Step 1: Replace the `SectionDefinition` interface and remove model/web-search constants**

Replace lines 13-21 (the `DEFAULT_MODEL`, `REASONING_MODEL`, `WebSearchToolVersion`, `DEFAULT_WEB_SEARCH`, `REASONING_WEB_SEARCH` exports) with:

```ts
// Adapters in src/lib/llm/adapters/* resolve tier to a provider-specific model.
// Sections only declare the abstract tier; they don't know which provider is active.
export type ModelTier = "default" | "reasoning";
```

Replace the `SectionDefinition` interface with:

```ts
export interface SectionDefinition<T = unknown> {
  key: string;
  title: string;
  order: number;
  cacheTtlDays: number;
  schemaVersion: number;
  tier: ModelTier;
  buildPrompt: (company: CompanyInput) => string;
  outputSchema: ZodType<T>;
  Renderer: React.FC<RendererProps<T>>;
  SkeletonRenderer: React.FC;
}
```

- [ ] **Step 2: Typecheck — expect failures across sections**

Run: `npx tsc --noEmit`
Expected: errors in 7 section files because they still pass `model` and `webSearchVersion`. This drives Task 14.

---

### Task 14: Update each section to use `tier`

**Files:**
- Modify: `src/lib/sections/snapshot.tsx:177-178` — replace `model: DEFAULT_MODEL, webSearchVersion: DEFAULT_WEB_SEARCH,` with `tier: "default",` and remove the corresponding imports
- Modify: `src/lib/sections/moat.tsx:454-455` — replace `model: REASONING_MODEL, webSearchVersion: REASONING_WEB_SEARCH,` with `tier: "reasoning",`
- Modify: `src/lib/sections/founders.tsx` — same pattern, find the `model:` + `webSearchVersion:` lines and replace with `tier: "default",`
- Modify: `src/lib/sections/tech-stack.tsx` — same as founders
- Modify: `src/lib/sections/funding.tsx` — same as founders
- Modify: `src/lib/sections/traction.tsx` — same as founders
- Modify: `src/lib/sections/market.tsx` — same as founders

For each file, also remove the now-unused imports of `DEFAULT_MODEL`, `REASONING_MODEL`, `DEFAULT_WEB_SEARCH`, `REASONING_WEB_SEARCH` from `./types`.

- [ ] **Step 1: Edit all 7 sections**

Example diff for `snapshot.tsx`:

```diff
-import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
+// (DEFAULT_MODEL / DEFAULT_WEB_SEARCH removed — sections now declare an abstract tier)
@@
-  model: DEFAULT_MODEL,
-  webSearchVersion: DEFAULT_WEB_SEARCH,
+  tier: "default",
```

Example diff for `moat.tsx`:

```diff
-import { REASONING_MODEL, REASONING_WEB_SEARCH } from "./types";
+// REASONING_MODEL / REASONING_WEB_SEARCH removed — moat now declares tier: "reasoning"
@@
-  model: REASONING_MODEL,
-  webSearchVersion: REASONING_WEB_SEARCH,
+  tier: "reasoning",
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 15: Update route.ts and disambiguate.ts to consume tier

**Files:**
- Modify: `src/app/api/research/route.ts:235-256` (the `callAndValidate` helper)
- Modify: `src/lib/disambiguate.ts` (call to `runResearchCall`)

`route.ts` currently passes `model: section.model, webSearchVersion: section.webSearchVersion` to `runResearchCall`. It must now pass through `runResearchCall` from `@/lib/llm` with `{ config, tier, prompt, schema }`.

The `config` comes from the new `selectProvider` flow added in Phase 3. For Phase 2, **temporarily** keep `route.ts` building a synthetic Anthropic-only config from the existing `apiKey` extraction so the test suite stays green:

- [ ] **Step 1: Replace `callAndValidate` in route.ts**

```ts
// In src/app/api/research/route.ts
import { runResearchCall, type ProviderConfig } from "@/lib/llm";

type CallAndValidateArgs = {
  config: ProviderConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: SectionDefinition<any>;
  prompt: string;
};

async function callAndValidate(args: CallAndValidateArgs) {
  const { config, section, prompt } = args;
  const result = await runResearchCall({
    config,
    tier: section.tier,
    prompt,
    schema: section.outputSchema,
  });

  const rawCitations = extractCitations(result.data);
  const statuses = await validateCitations(rawCitations);
  const citations: Citation[] = rawCitations.map((c, i) => ({ ...c, status: statuses[i] }));
  const summary = summarizeCitationStatuses(rawCitations, statuses);

  return {
    content: result.data,
    citations,
    modelVersion: result.modelVersion,
    summary,
  };
}
```

- [ ] **Step 2: Update `runOneSection` to pass `config` instead of `apiKey`**

In `runOneSection`, replace the `apiKey` field on `RunSectionArgs` with `config: ProviderConfig`, and update the synthetic config built at the POST entry point:

```ts
// At the top of POST(), after extracting headerKey/envKey:
const config: ProviderConfig = {
  provider: "anthropic",
  searchBackend: "native",
  llmKey: apiKey,
  exaKey: null,
};
// Pass this `config` into runOneSection / disambiguateCompany instead of `apiKey`.
```

- [ ] **Step 3: Update `disambiguate.ts` similarly**

```ts
// src/lib/disambiguate.ts — change runResearchCall import + call
import { runResearchCall } from "@/lib/llm";
import type { ProviderConfig } from "@/lib/llm";

export async function disambiguateCompany({
  config,
  name,
  domain,
}: {
  config: ProviderConfig;
  name: string;
  domain: string | null;
}) {
  // ...existing prompt building...
  const result = await runResearchCall({
    config,
    tier: "default",
    prompt,
    schema: disambigSchema,
  });
  return result.data;
}
```

Update the call site in `route.ts` to pass `{ config, name, domain }`.

- [ ] **Step 4: Update `__tests__/research.test.ts` assertions**

The test asserts on `model` and `webSearchVersion` (lines 184-198). After this refactor, `model` is resolved inside the adapter, so the assertions still hold (the adapter still calls Anthropic with `claude-opus-4-7` for moat). No test code changes needed if the adapter resolves tiers correctly. Run the suite to confirm.

- [ ] **Step 5: Delete the legacy `src/lib/anthropic.ts` shim**

Now that no callers reference the legacy signature, delete the file:

```bash
git rm src/lib/anthropic.ts
```

If anything still imports from `@/lib/anthropic`, fix the imports to `@/lib/llm` before this delete.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: 41 passing.

- [ ] **Step 7: Build**

Run: `npm run build 2>&1 | tail -10`
Expected: clean.

---

### Task 16: Phase 2 commit

- [ ] **Step 1: Stage + commit**

```bash
git add src/lib/sections src/app/api/research/route.ts src/lib/disambiguate.ts __tests__/research.test.ts
git rm -- src/lib/anthropic.ts 2>/dev/null || true
git commit -m "$(cat <<'EOF'
refactor(sections): replace model/webSearchVersion with abstract tier

Sections no longer carry provider-specific model IDs or web_search tool
versions. They declare an abstract tier ("default" | "reasoning") and the
LLM adapter resolves it.

This decouples the registry from Anthropic and lets adapters/kimi.ts use
its own model mapping without touching section files.

Also retires the src/lib/anthropic.ts compat shim — all callers now go
through src/lib/llm directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Settings UI + route wiring

This phase is the user-visible change: settings page accepts Kimi + EXA keys, the route consumes them, and a Kimi+EXA research call works end to end.

### Task 17: Route — read 3 keys + selectProvider

**Files:**
- Modify: `src/app/api/research/route.ts:27-63`

- [ ] **Step 1: Replace the key-extraction + auth block**

```ts
// Replace lines 27-63 with:
import { selectProvider, type Keys } from "@/lib/llm";

const headerKeys: Keys = {
  anthropic: request.headers.get("x-anthropic-key"),
  kimi: request.headers.get("x-kimi-key"),
  exa: request.headers.get("x-exa-key"),
};
const keys: Keys = {
  anthropic: headerKeys.anthropic ?? process.env.ANTHROPIC_API_KEY ?? null,
  kimi: headerKeys.kimi ?? process.env.KIMI_API_KEY ?? null,
  exa: headerKeys.exa ?? process.env.EXA_API_KEY ?? null,
};

let body: z.infer<typeof bodySchema>;
try {
  body = bodySchema.parse(await request.json());
} catch {
  return new Response(JSON.stringify({ error: "Invalid request body" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

if (process.env.MOCK_RESEARCH === "true") {
  // ... existing mock branch unchanged
}

const selected = selectProvider(keys);
if (!selected.ok) {
  const status = selected.error === "missing_api_key" ? 401 : 400;
  return new Response(
    JSON.stringify({ error: selected.error, message: selected.message }),
    { status, headers: { "content-type": "application/json" } },
  );
}
const config = selected.config;

if (process.env.NODE_ENV !== "production") {
  console.log(
    `[research] provider=${config.provider} search=${config.searchBackend} keySource=${
      headerKeys[config.provider] ? "header" : "env"
    }`,
  );
}
```

Then thread `config` through `disambiguateCompany`, `runOneSection`, and `callAndValidate` (those signatures are already `config`-shaped from Task 15).

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: 41 passing — `research.test.ts` still uses `x-anthropic-key`, which now flows through `selectProvider` and resolves to the same Anthropic+native path.

---

### Task 18: Page — handle new error codes + send 3 keys

**Files:**
- Modify: `src/app/company/[slug]/page.tsx:96-101` (the `apiKey` extraction) + `:296-315` (the `runResearch` headers)

- [ ] **Step 1: Extend localStorage read**

Replace the single `apiKey` read with all three:

```ts
// In the cache-miss branch, before calling runResearch:
const keys = typeof window !== "undefined"
  ? {
      anthropic: window.localStorage.getItem("anthropic_api_key"),
      kimi: window.localStorage.getItem("kimi_api_key"),
      exa: window.localStorage.getItem("exa_api_key"),
    }
  : { anthropic: null, kimi: null, exa: null };

setPhase("researching");
await runResearch({
  slug,
  keys,
  force: isRefresh,
  // ...rest unchanged
});
```

- [ ] **Step 2: Update `runResearch` to forward all three headers**

```ts
type RunResearchArgs = {
  slug: string;
  keys: { anthropic: string | null; kimi: string | null; exa: string | null };
  force: boolean;
  signal: AbortSignal;
  onCompany: (c: Company) => void;
  onSection: (key: string, state: SectionState) => void;
  onDone: () => void;
  onError: (msg: string) => void;
};

async function runResearch(args: RunResearchArgs) {
  const { slug, keys, force, signal, onCompany, onSection, onDone, onError } = args;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keys.anthropic) headers["x-anthropic-key"] = keys.anthropic;
  if (keys.kimi) headers["x-kimi-key"] = keys.kimi;
  if (keys.exa) headers["x-exa-key"] = keys.exa;

  const res = await fetch("/api/research", {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({ name: humanizeSlug(slug), domain: null, force }),
  });

  if (!res.ok || !res.body) {
    if (res.status === 401) {
      onError("missing_key");
      return;
    }
    if (res.status === 400) {
      try {
        const body = await res.clone().json();
        if (body.error === "missing_search_key") {
          onError("missing_search_key");
          return;
        }
      } catch {
        /* fall through */
      }
    }
    onError(`Research call failed: ${res.status}`);
    return;
  }
  // ... rest of streaming loop unchanged
}
```

- [ ] **Step 3: Surface the new error in the UI**

Find the `phase === "needs_key"` branch in the JSX (around line 201) and split it into two messages:

```tsx
{phase === "needs_key" && (
  <div
    className="mb-12 rounded-md p-4 text-sm"
    style={{
      border: "1px solid var(--accent-border)",
      background: "var(--accent-bg)",
      color: "var(--text)",
    }}
  >
    {errorMsg === "missing_search_key" ? (
      <>
        Kimi requires an EXA key for web search. Add an EXA key in{" "}
        <Link className="underline font-medium" href="/settings">/settings</Link>.
      </>
    ) : (
      <>
        Set your Anthropic or Kimi API key in{" "}
        <Link className="underline font-medium" href="/settings">/settings</Link>{" "}
        to research new companies. Cached reports load without a key.
      </>
    )}
  </div>
)}
```

Update the `needs_key` branch in `onError` to thread the specific error message into `errorMsg`:

```ts
onError: (msg) => {
  if (msg === "missing_key" || msg === "missing_search_key") {
    setErrorMsg(msg);
    setPhase("needs_key");
    return;
  }
  // ... rest unchanged
},
```

---

### Task 19: Settings page — Kimi + EXA inputs + active routing line

**Files:**
- Modify: `src/app/settings/page.tsx` (full rewrite — currently single-key)

- [ ] **Step 1: Rewrite the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectProvider } from "@/lib/llm";

const FIELDS = [
  {
    storageKey: "anthropic_api_key",
    label: "Anthropic API key",
    placeholder: "sk-ant-…",
    href: "https://console.anthropic.com/settings/keys",
    validate: (v: string) => v.startsWith("sk-ant-") && v.length > 20,
  },
  {
    storageKey: "kimi_api_key",
    label: "Kimi API key",
    placeholder: "sk-…",
    href: "https://platform.moonshot.ai/console/api-keys",
    validate: (v: string) => v.length > 10,
  },
  {
    storageKey: "exa_api_key",
    label: "EXA API key",
    placeholder: "Exa key…",
    href: "https://dashboard.exa.ai",
    validate: (v: string) => v.length > 10,
  },
] as const;

export default function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const f of FIELDS) {
      loaded[f.storageKey] = window.localStorage.getItem(f.storageKey) ?? "";
    }
    setKeys(loaded);
    setHydrated(true);
  }, []);

  const routing = hydrated
    ? selectProvider({
        anthropic: keys["anthropic_api_key"] || null,
        kimi: keys["kimi_api_key"] || null,
        exa: keys["exa_api_key"] || null,
      })
    : null;

  return (
    <main className="mx-auto max-w-xl px-8 py-14">
      <header className="mb-10">
        <div className="eyebrow mb-2">Settings</div>
        <h1
          className="font-serif"
          style={{ fontSize: 34, lineHeight: 1.1, color: "var(--text)" }}
        >
          API keys
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Stored only in this browser. Sent with each fresh research request.
          Never transmitted to FounderScope servers.
        </p>
      </header>

      <section className="space-y-8">
        {FIELDS.map((f) => (
          <KeyField
            key={f.storageKey}
            field={f}
            value={keys[f.storageKey] ?? ""}
            onChange={(v) => setKeys((s) => ({ ...s, [f.storageKey]: v }))}
            onSave={(v) => {
              window.localStorage.setItem(f.storageKey, v);
              toast.success(`${f.label} saved`);
            }}
            onClear={() => {
              window.localStorage.removeItem(f.storageKey);
              setKeys((s) => ({ ...s, [f.storageKey]: "" }));
              toast.success(`${f.label} cleared`);
            }}
          />
        ))}
      </section>

      {hydrated && routing && (
        <p
          className="mt-10 text-xs"
          style={{ color: "var(--text-quiet)" }}
        >
          {routing.ok
            ? `Active: ${routing.config.provider} + ${routing.config.searchBackend === "exa" ? "EXA" : "native search"}`
            : `Not configured: ${routing.message}`}
        </p>
      )}
    </main>
  );
}

interface FieldDef {
  storageKey: string;
  label: string;
  placeholder: string;
  href: string;
  validate: (v: string) => boolean;
}

function KeyField({
  field,
  value,
  onChange,
  onSave,
  onClear,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  onClear: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const trimmed = value.trim();
  const valid = trimmed.length === 0 || field.validate(trimmed);
  const dirty = trimmed.length > 0; // simplification: "save if input has content"

  return (
    <div>
      <label
        htmlFor={field.storageKey}
        className="block text-xs mb-2"
        style={{ color: "var(--text-faint)", letterSpacing: "0.04em" }}
      >
        {field.label.toUpperCase()}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={field.storageKey}
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pr-9 font-mono text-xs"
            aria-invalid={value.length > 0 && !valid ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide key" : "Show key"}
            className="absolute inset-y-0 right-2 flex items-center"
            style={{ color: "var(--text-faint)" }}
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <Button
          onClick={() => onSave(trimmed)}
          disabled={!dirty || !valid}
          size="sm"
        >
          Save
        </Button>
        <Button onClick={onClear} variant="outline" size="sm">
          Clear
        </Button>
      </div>
      <a
        href={field.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
        style={{ color: "var(--text-faint)" }}
      >
        Get a key →
        <ExternalLink size={11} />
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: clean.

---

### Task 20: Add a route test for the missing_search_key path

**Files:**
- Modify: `__tests__/research.test.ts` (append a new test inside the existing `describe`)

- [ ] **Step 1: Append the test**

```ts
it("returns 400 missing_search_key when only Kimi key is provided", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const req = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kimi-key": "km-test",
      },
      body: JSON.stringify({ name: "Stripe", domain: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_search_key");
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
```

- [ ] **Step 2: Run**

Run: `npm test`
Expected: 42 passing.

---

### Task 21: Phase 3 commit + push

- [ ] **Step 1: Build sanity**

Run: `npm run build 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 2: Stage + commit**

```bash
git add src/app/api/research/route.ts \
  src/app/company/[slug]/page.tsx \
  src/app/settings/page.tsx \
  __tests__/research.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): Kimi + EXA key inputs + auto-routing in /api/research

- Settings page: three key fields (Anthropic, Kimi, EXA) + an "Active
  routing" status line driven by selectProvider. Each field stores in
  localStorage and validates the obvious format prefix.
- Research route: reads x-anthropic-key, x-kimi-key, x-exa-key (with
  per-key env fallback) and resolves a ProviderConfig via selectProvider.
  Returns 400 missing_search_key when Kimi is set but EXA is not.
- Company page: forwards all three keys, surfaces missing_search_key as
  a distinct UI message pointing at /settings.

End to end: a user with only Kimi + EXA keys can now run full research
through the Kimi-via-Anthropic-compat adapter with EXA as the search
backend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin phase-3/foundation-slice
```

---

## Phase 4 — Verification

### Task 22: Manual smoke test — Anthropic + native (regression)

After `vercel --prod`:

- [ ] Open the prod URL.
- [ ] `/settings` → confirm Anthropic key already saved is still there.
- [ ] Search a company that has no cached report. Expect: research streams identically to before this slice.
- [ ] Compare a re-research result against the pre-slice cached version (eyeball — no schema or content drift).

### Task 23: Manual smoke test — Anthropic + EXA

- [ ] `/settings` → save EXA key. Status line: "Active: anthropic + EXA".
- [ ] Research a fresh company.
- [ ] In Vercel logs, confirm the line `[research] provider=anthropic search=exa keySource=...`.
- [ ] In the network tab, confirm `/api/research` SSE stream completes; sections render.
- [ ] EXA dashboard at `dashboard.exa.ai` shows search calls happening.

### Task 24: Manual smoke test — Kimi + EXA

- [ ] `/settings` → clear Anthropic key, save Kimi key. Status line: "Active: kimi + EXA".
- [ ] Research a fresh company.
- [ ] Vercel logs: `provider=kimi search=exa`.
- [ ] All 7 sections complete. **Watch moat especially** — Kimi K2.6 is single-tier so we lose Anthropic's reasoning-model split. Note any quality regressions in the moat output for follow-up.
- [ ] Cost: roughly verify per-research cost from Moonshot dashboard is materially below the Anthropic baseline.

### Task 25: Negative paths

- [ ] Clear all three keys. Research a fresh company. Expect `needs_key` UI pointing at /settings with the "Anthropic or Kimi" message.
- [ ] Save only Kimi (no EXA). Research a fresh company. Expect `needs_key` UI with the "Kimi requires an EXA key" message.

---

## Self-Review

**Spec coverage check:**
- ✓ Provider abstraction (Tasks 1, 8, 9, 10) — `src/lib/llm/` with selector + adapters
- ✓ Routing matrix (Tasks 2, 3) — `selectProvider` + 8 covering test cases
- ✓ Model tier abstraction (Tasks 13, 14) — `tier` replaces `model` + `webSearchVersion`
- ✓ EXA function tool (Tasks 4-7) — `exa-search.ts` + handler
- ✓ Anthropic + EXA tool list (Task 8) — `buildTools` drops native web_search when backend is EXA
- ✓ Kimi adapter (Task 9) — baseURL override, EXA-only tools
- ✓ Settings UI (Task 19) — 3 key fields + status line
- ✓ Server route changes (Task 17) — 3 headers, selectProvider, 400 missing_search_key
- ✓ Client error handling (Task 18) — distinct message for missing_search_key
- ✓ Citation extraction unchanged (no task touches it — it lives in `route.ts` and is provider-neutral)
- ✓ MAX_TURNS=12 (preserved in both adapters)
- ✓ Migration plan (Phase 1/2/3 commits, each independently revertable)
- ✓ Testing (unit + integration coverage at each phase boundary)

**Placeholder scan:** No TBD/TODO. The Kimi model ID + baseURL note in Task 9 explicitly flags Phase 1 verification rather than leaving it ambiguous.

**Type consistency:**
- `Keys`, `ProviderConfig`, `RunArgs`, `RunResult`, `ModelTier` defined in Task 1 and used consistently in Tasks 8, 9, 10, 11, 15, 17, 19.
- `selectProvider` returns the discriminated union from Task 3 used identically in Tasks 17 and 19.
- `ResearchError` defined in Task 8 (errors.ts), re-exported in Task 10, consumed by both adapters.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-10-kimi-exa-support.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best when tasks have clean boundaries (this plan does).
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
