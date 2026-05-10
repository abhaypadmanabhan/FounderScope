# Kimi K2.6 Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Kimi adapter against the OpenAI-compatible Moonshot endpoint to unlock K2.6 thinking mode, strict `json_schema` output, and `prompt_cache_key` (≈6× input-cost reduction on warm cache) — with zero regression on the Anthropic path.

**Architecture:** Replace `src/lib/llm/adapters/kimi.ts` (currently `@anthropic-ai/sdk` against `api.moonshot.ai/anthropic`) with a fresh implementation using the `openai` SDK against `api.moonshot.ai/v1`. Add a `cacheKey` field to `RunArgs<T>` and `SectionDefinition`, threaded from each section through `route.ts` so Kimi can pass it as `prompt_cache_key`. Anthropic adapter accepts and ignores the new field. EXA stays the search backend; routing in `provider.ts` unchanged.

**Tech Stack:** TypeScript strict, Next.js 14 App Router, `openai` ≥ 4.x SDK, `@anthropic-ai/sdk` (Anthropic adapter only), `zod`, `zod-to-json-schema`, vitest.

**Spec:** [`docs/superpowers/specs/2026-05-10-kimi-k26-optimization-design.md`](../specs/2026-05-10-kimi-k26-optimization-design.md). Trust spec decisions — research is done.

**Out of scope:** Kimi `$web_search`, Firecrawl, DeepSeek/Minimax providers, streaming Kimi token output, per-section provider override, Anthropic prompt caching.

---

## File Map

**Create:**
- `__tests__/kimi-openai-adapter.test.ts` — adapter unit tests (mocks `openai` SDK).
- `__tests__/kimi-json-schema.test.ts` — section-schema → MFJS-compatible JSON schema smoke tests.

**Modify:**
- `package.json` — add `openai` dep.
- `src/lib/llm/types.ts` — add `cacheKey?: string` to `RunArgs<T>`; add `CACHE_KEY_PREFIX` constant.
- `src/lib/llm/shared.ts` — add `parseFinalOpenAI`, `mapOpenAIError`. Keep `parseFinal`, `mapSdkError`, `extractJson`, `withRetry` as-is.
- `src/lib/llm/adapters/kimi.ts` — full rewrite against `openai` SDK.
- `src/lib/llm/adapters/anthropic.ts` — single change: accept (and ignore) `args.cacheKey`. Behavior unchanged.
- `src/lib/llm/tools/exa-search.ts` — add `openaiToolDef()` helper.
- `src/lib/sections/types.ts` — add required `cacheKey: string` field to `SectionDefinition`.
- `src/lib/sections/{snapshot,moat,founders,tech-stack,funding,traction,market}.tsx` — add `cacheKey: "founderscope:section:<key>"` to each `SectionDefinition` literal.
- `src/lib/disambiguate.ts` — pass `cacheKey: "founderscope:disambiguate"` to `runResearchCall`.
- `src/app/api/research/route.ts` — pass `cacheKey: section.cacheKey` to `runResearchCall`.
- `__tests__/section-fixtures.test.ts` — assert each section has the expected `cacheKey`.
- `__tests__/exa-budget.test.ts` — drop the Kimi block (it now lives in `kimi-openai-adapter.test.ts`); Anthropic block stays.

**Untouched:**
- `src/lib/llm/provider.ts` — routing unchanged.
- `src/lib/llm/errors.ts`, `src/lib/llm/index.ts` — unchanged.
- `src/lib/llm/tools/exa-client.ts` — unchanged.
- `__tests__/provider-select.test.ts` — unchanged.
- `__tests__/research.test.ts` — uses Anthropic SDK mock; new field is optional — should not need changes. Re-verify after final task.

---

## Conventions used in this plan

- Section keys (registry): `snapshot`, `moat`, `founders`, `tech_stack`, `funding`, `traction`, `market`. Tier: `moat → reasoning`; the other six → `default`.
- `cacheKey` format: `"founderscope:section:<sectionKey>"` for sections, `"founderscope:disambiguate"` for the disambiguate call.
- Commits are conventional: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`. One commit per logical chunk. Never use `--no-verify`.
- Run all commands from repo root: `/Users/abhayp/Downloads/Projects/FounderScope`.
- Test runner: `npm test -- <pattern>` runs a subset; `npm test` runs all.
- Type check: `npx tsc --noEmit`.

---

## Task 1: Install `openai` SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `openai` SDK**

Run:
```bash
npm install openai
```

Expected: `package.json` gains `"openai": "^4.x"` under `dependencies`; `package-lock.json` updates.

- [ ] **Step 2: Verify install**

Run:
```bash
npm ls openai
```

Expected output contains `openai@4.<minor>.<patch>` (or higher) at top level.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add openai SDK for Kimi OpenAI-compat adapter"
```

---

## Task 2: Add `cacheKey?: string` to `RunArgs<T>` and a `CACHE_KEY_PREFIX` constant

**Files:**
- Modify: `src/lib/llm/types.ts`

- [ ] **Step 1: Write failing type assertion test**

Create `__tests__/run-args-cache-key.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { RunArgs } from "@/lib/llm/types";
import { CACHE_KEY_PREFIX } from "@/lib/llm/types";
import { z } from "zod";

describe("RunArgs.cacheKey", () => {
  it("is an optional string field", () => {
    expectTypeOf<RunArgs<{ ok: boolean }>["cacheKey"]>().toEqualTypeOf<string | undefined>();
  });

  it("CACHE_KEY_PREFIX is the founderscope namespace", () => {
    expect(CACHE_KEY_PREFIX).toBe("founderscope");
  });
});

// vitest globals
declare const expect: typeof import("vitest").expect;
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm test -- run-args-cache-key
```

Expected: FAIL — `cacheKey` does not exist on `RunArgs`, `CACHE_KEY_PREFIX` is not exported.

- [ ] **Step 3: Modify `src/lib/llm/types.ts`**

```ts
// Provider abstraction types — section authors and route.ts depend on this surface.
import type { ZodType } from "zod";

export type ProviderId = "anthropic" | "kimi";
export type SearchBackend = "native" | "exa";
export type ModelTier = "default" | "reasoning";

// Stable namespace for prompt_cache_key values across the project. Keep ASCII
// only and lower-case — Moonshot stores cache_key on a string-equality basis.
export const CACHE_KEY_PREFIX = "founderscope" as const;

// Per-section EXA budget. Hard cap regardless of provider — protects
// monthly EXA quota and forces model to converge instead of search-forever.
export const EXA_BUDGET: Record<ModelTier, number> = {
  default: 8,
  reasoning: 10,
} as const;

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
  /**
   * Stable Moonshot prompt_cache_key. Anthropic adapter currently ignores this.
   * Format: "founderscope:section:<sectionKey>" or "founderscope:disambiguate".
   */
  cacheKey?: string;
}

export interface RunResult<T> {
  data: T;
  raw: string;
  modelVersion: string;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
npm test -- run-args-cache-key
```

Expected: PASS.

- [ ] **Step 5: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: clean exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/types.ts __tests__/run-args-cache-key.test.ts
git commit -m "feat(llm): add optional cacheKey to RunArgs + CACHE_KEY_PREFIX"
```

---

## Task 3: Add required `cacheKey: string` to `SectionDefinition`

**Files:**
- Modify: `src/lib/sections/types.ts`
- Modify: `__tests__/section-fixtures.test.ts`

- [ ] **Step 1: Write failing test**

Add a new `describe` block at the bottom of `__tests__/section-fixtures.test.ts`:

```ts
describe("each section declares a stable cacheKey", () => {
  for (const section of SECTIONS) {
    it(`${section.key} has cacheKey "founderscope:section:${section.key}"`, () => {
      expect(section.cacheKey).toBe(`founderscope:section:${section.key}`);
    });
  }
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm test -- section-fixtures
```

Expected: FAIL — `section.cacheKey` is `undefined`.

- [ ] **Step 3: Modify `src/lib/sections/types.ts`**

Insert `cacheKey: string;` between `key` and `title`:

```ts
export interface SectionDefinition<T = unknown> {
  key: string;
  /** Stable Moonshot prompt_cache_key. Format: "founderscope:section:<key>". */
  cacheKey: string;
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

- [ ] **Step 4: Type check — expect FAIL on each section file**

Run:
```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors on every `SectionDefinition<...>` literal in the seven section files (`Property 'cacheKey' is missing in type ...`). This confirms the contract change is enforced everywhere we expected.

- [ ] **Step 5: Add `cacheKey` to all 7 section literals**

Each section file has a `SectionDefinition` exported at the bottom. Add the line `cacheKey: "founderscope:section:<sectionKey>",` directly under `key:`. Specifically:

`src/lib/sections/snapshot.tsx` (around line 180):
```ts
export const snapshot: SectionDefinition<Output> = {
  key: "snapshot",
  cacheKey: "founderscope:section:snapshot",
  title: "Snapshot",
  // ...rest unchanged
```

`src/lib/sections/moat.tsx` (around line 448):
```ts
  key: "moat",
  cacheKey: "founderscope:section:moat",
  title: "Moat",
```

`src/lib/sections/founders.tsx` (around line 74):
```ts
  key: "founders",
  cacheKey: "founderscope:section:founders",
  title: "Founders",
```

`src/lib/sections/tech-stack.tsx` (around line 325):
```ts
  key: "tech_stack",
  cacheKey: "founderscope:section:tech_stack",
  title: "Tech Stack",
```

`src/lib/sections/funding.tsx` (around line 363):
```ts
  key: "funding",
  cacheKey: "founderscope:section:funding",
  title: "Funding",
```

`src/lib/sections/traction.tsx` (around line 339):
```ts
  key: "traction",
  cacheKey: "founderscope:section:traction",
  title: "Traction",
```

`src/lib/sections/market.tsx` (around line 382):
```ts
  key: "market",
  cacheKey: "founderscope:section:market",
  title: "Market",
```

(If a section's literal does not already place `key:` first, just insert `cacheKey:` immediately after `key:`. The order of object literal fields is irrelevant at runtime — readability only.)

- [ ] **Step 6: Type check — expect PASS**

Run:
```bash
npx tsc --noEmit
```

Expected: clean exit code 0.

- [ ] **Step 7: Run test — expect PASS**

Run:
```bash
npm test -- section-fixtures
```

Expected: 7 new `cacheKey` assertions pass. All existing schema assertions still pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/sections/types.ts src/lib/sections/*.tsx __tests__/section-fixtures.test.ts
git commit -m "feat(sections): add stable cacheKey to every SectionDefinition"
```

---

## Task 4: Plumb `cacheKey` from `route.ts` and `disambiguate.ts`

**Files:**
- Modify: `src/app/api/research/route.ts`
- Modify: `src/lib/disambiguate.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/route-cache-key.test.ts`:

```ts
// Asserts that route.ts plumbs section.cacheKey + disambiguate cacheKey
// through to runResearchCall.
import { describe, it, expect, vi, beforeEach } from "vitest";

const runCalls: Array<{ cacheKey?: string; promptHasCanonical: boolean }> = [];

vi.mock("@/lib/companies", () => ({
  findOrCreateCompany: vi.fn(async () => ({
    id: "co-1",
    slug: "stripe",
    display_name: "Stripe",
    domain: null,
    logo_url: null,
    last_refreshed_at: null,
  })),
  touchLastRefreshed: vi.fn(async () => undefined),
  updateCompanyCanonical: vi.fn(async () => undefined),
  getCompanyBySlug: vi.fn(async () => null),
}));

vi.mock("@/lib/cache", () => ({
  getCachedSection: vi.fn(async () => null),
  upsertCachedSection: vi.fn(async () => undefined),
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...original,
    runResearchCall: vi.fn(async (args: { cacheKey?: string; prompt: string; schema: { parse: (x: unknown) => unknown } }) => {
      runCalls.push({
        cacheKey: args.cacheKey,
        promptHasCanonical: args.prompt.includes("canonical_name"),
      });
      // Return a minimal-ish payload that matches every section schema's bare bones.
      // The route catches errors per-section, so a parse failure is acceptable here —
      // we only care about cacheKey threading.
      return {
        data: args.schema.parse({}),
        raw: "{}",
        modelVersion: "claude-haiku-4-5",
      };
    }),
  };
});

beforeEach(() => {
  runCalls.length = 0;
  global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
});

import { POST } from "@/app/api/research/route";

describe("/api/research cacheKey threading", () => {
  it("passes founderscope:disambiguate for the disambig call and founderscope:section:<key> for each section", async () => {
    const req = new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": "sk-test" },
      body: JSON.stringify({ name: "Stripe", domain: null }),
    });
    const res = await POST(req);
    // Drain the SSE stream so the route's async work finishes.
    const reader = res.body!.getReader();
    while (!(await reader.read()).done) {
      // discard
    }

    const disambig = runCalls.find((c) => c.promptHasCanonical);
    expect(disambig?.cacheKey).toBe("founderscope:disambiguate");

    const sectionKeys = [
      "snapshot",
      "moat",
      "founders",
      "tech_stack",
      "funding",
      "traction",
      "market",
    ];
    const seen = new Set(runCalls.map((c) => c.cacheKey));
    for (const key of sectionKeys) {
      expect(seen.has(`founderscope:section:${key}`)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm test -- route-cache-key
```

Expected: FAIL — `cacheKey` is `undefined` for all calls because nothing passes it yet.

- [ ] **Step 3: Modify `src/lib/disambiguate.ts`**

Find the `runResearchCall({...})` invocation (around line 64) and add `cacheKey`:

```ts
  const result = await runResearchCall({
    config: opts.config,
    tier: "default",
    prompt,
    schema: DisambiguationSchema,
    cacheKey: "founderscope:disambiguate",
  });
```

- [ ] **Step 4: Modify `src/app/api/research/route.ts`**

Find `callAndValidate` (around line 248) and update the `runResearchCall` invocation to pass `section.cacheKey`:

```ts
  const result = await runResearchCall({
    config,
    tier: section.tier,
    prompt,
    schema: section.outputSchema,
    cacheKey: section.cacheKey,
  });
```

- [ ] **Step 5: Run test — expect PASS**

Run:
```bash
npm test -- route-cache-key
```

Expected: PASS.

- [ ] **Step 6: Run pre-existing research test — expect PASS**

Run:
```bash
npm test -- research.test
```

Expected: PASS (the new optional field is invisible to existing assertions).

- [ ] **Step 7: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/research/route.ts src/lib/disambiguate.ts __tests__/route-cache-key.test.ts
git commit -m "feat(llm): thread cacheKey from sections + disambiguate to runResearchCall"
```

---

## Task 5: Anthropic adapter — accept (and ignore) `args.cacheKey`

The Anthropic adapter should already compile because `cacheKey` is optional and Anthropic destructures specific fields. But verify and add a regression test that the field is ignored.

**Files:**
- Modify: `src/lib/llm/adapters/anthropic.ts` (if needed)
- Create: extend `__tests__/research.test.ts` OR add a focused test (we add a focused test)

- [ ] **Step 1: Write failing regression test**

Create `__tests__/anthropic-cache-key-noop.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

Run:
```bash
npm test -- anthropic-cache-key-noop
```

Expected: PASS as-is — the adapter already destructures only `{ config, tier, prompt, schema }` so `cacheKey` is silently dropped. If for any reason it FAILS (e.g. someone passed `args` directly to the SDK), apply Step 3.

- [ ] **Step 3 (only if Step 2 fails): adjust `runAnthropic`**

In `src/lib/llm/adapters/anthropic.ts` find the destructure (around line 33):
```ts
  const { config, tier, prompt, schema } = args;
```
This already drops `cacheKey`. If a future maintainer adds `...args` spreads anywhere into the SDK call, that's a regression — the test above guards it.

- [ ] **Step 4: Commit**

```bash
git add __tests__/anthropic-cache-key-noop.test.ts
git commit -m "test(llm): lock Anthropic adapter as a cacheKey no-op"
```

---

## Task 6: Add `parseFinalOpenAI` and `mapOpenAIError` helpers to `shared.ts`

**Files:**
- Modify: `src/lib/llm/shared.ts`
- Create test: `__tests__/shared-openai-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/shared-openai-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseFinalOpenAI,
  mapOpenAIError,
} from "@/lib/llm/shared";
import { ResearchError } from "@/lib/llm/errors";

const SimpleSchema = z.object({ ok: z.boolean() });

function makeChatCompletion(content: string, model = "kimi-k2.6") {
  return {
    id: "chatcmpl-test",
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop" as const,
        message: { role: "assistant" as const, content },
      },
    ],
  };
}

describe("parseFinalOpenAI", () => {
  it("parses pure JSON when strict json_schema returns clean output", () => {
    const resp = makeChatCompletion('{"ok":true}');
    const result = parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
    expect(result.data).toEqual({ ok: true });
    expect(result.modelVersion).toBe("kimi-k2.6");
    expect(result.raw).toBe('{"ok":true}');
  });

  it("falls back to extractJson when content has accidental fencing", () => {
    const resp = makeChatCompletion('```json\n{"ok":true}\n```');
    const result = parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
    expect(result.data).toEqual({ ok: true });
  });

  it("throws schema_validation when content is empty", () => {
    const resp = makeChatCompletion("");
    expect(() => parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi"))
      .toThrow(ResearchError);
  });

  it("throws schema_validation when JSON parses but Zod rejects", () => {
    const resp = makeChatCompletion('{"ok":"not-a-bool"}');
    try {
      parseFinalOpenAI(resp, SimpleSchema, "kimi-k2.6", "kimi");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ResearchError);
      expect((err as ResearchError).category).toBe("schema_validation");
    }
  });
});

describe("mapOpenAIError", () => {
  it("maps AbortError name → timeout", () => {
    const err: { name: string } = { name: "AbortError" };
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("timeout");
    expect(mapped.message).toMatch(/Kimi call timed out after 120000ms/);
  });

  it("maps 401 → auth_error", () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("auth_error");
    expect(mapped.message).toMatch(/Invalid Kimi API key/);
  });

  it("maps 429 → rate_limit", () => {
    const err = Object.assign(new Error("Slow down"), { status: 429 });
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("rate_limit");
  });

  it("maps generic OpenAI APIError-shaped error → model_error", () => {
    const err = Object.assign(new Error("boom"), { status: 500 });
    const mapped = mapOpenAIError(err, "Kimi", 120_000);
    expect(mapped.category).toBe("model_error");
  });

  it("maps non-Error → model_error with stringified value", () => {
    const mapped = mapOpenAIError("strange string thrown", "Kimi", 120_000);
    expect(mapped.category).toBe("model_error");
    expect(mapped.message).toMatch(/Unexpected Kimi error/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm test -- shared-openai-helpers
```

Expected: FAIL — `parseFinalOpenAI` and `mapOpenAIError` are not exported.

- [ ] **Step 3: Add the two helpers at the bottom of `src/lib/llm/shared.ts`**

Append the following block (do not modify the existing helpers):

```ts
// ---------------------------------------------------------------------------
// OpenAI-compat helpers (Kimi via api.moonshot.ai/v1)
// ---------------------------------------------------------------------------

/**
 * Minimal shape of an OpenAI-compat ChatCompletion the Kimi adapter needs.
 * We avoid importing the `openai` types here so this file stays SDK-agnostic
 * for tests that don't pull the SDK in.
 */
export interface OpenAIChatCompletionLike {
  id?: string;
  model?: string;
  choices: Array<{
    index?: number;
    finish_reason?: string;
    message: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cached_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
}

/**
 * Parse the final assistant message of an OpenAI-compat completion. Strict
 * json_schema mode SHOULD make `JSON.parse(content)` succeed; we still run
 * `extractJson` as a guard, then validate with Zod (matches `parseFinal`'s
 * contract for the Anthropic path).
 */
export function parseFinalOpenAI<T>(
  response: OpenAIChatCompletionLike,
  schema: ZodType<T>,
  resolvedModel: string,
  logPrefix: string,
): RunResult<T> {
  const content = response.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    if (isDev) {
      console.error(`[${logPrefix}] no content in final response`, {
        model: resolvedModel,
        finish_reason: response.choices?.[0]?.finish_reason,
      });
    }
    throw new ResearchError("model_error", "no content in final response", {});
  }

  // Strict json_schema mode SHOULD make this branch take the fast path.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Defensive fallback: model accidentally fenced or prose-prefixed the
    // output despite strict mode. Reuse extractJson for one retry before
    // we surface a schema_validation failure.
    const cleaned = extractJson(content);
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      if (isDev) {
        console.error(
          `[${logPrefix}] JSON parse failed (strict mode) for model`,
          resolvedModel,
          "text length",
          content.length,
        );
      }
      throw new ResearchError("schema_validation", "Model output is not valid JSON", {
        raw: content,
        cause: err,
      });
    }
  }

  try {
    const data = schema.parse(parsed);
    return { data, raw: content, modelVersion: response.model ?? resolvedModel };
  } catch (err) {
    if (err instanceof ZodError) {
      if (isDev) {
        console.error(`[${logPrefix}] schema_validation failure (openai)`, {
          model: resolvedModel,
          rawTextFirstChars: content.slice(0, 800),
          rawTextLastChars: content.slice(-300),
          rawTextLength: content.length,
          zodIssues: err.issues.slice(0, 8),
        });
      }
      throw new ResearchError(
        "schema_validation",
        `Zod schema validation failed: ${err.message}`,
        { raw: content, cause: err },
      );
    }
    throw err;
  }
}

/**
 * Map errors from the `openai` SDK (used against Moonshot's OpenAI-compat
 * endpoint) to ResearchError categories. Mirrors `mapSdkError` for Anthropic.
 *
 * The `openai` SDK throws subclasses of `OpenAI.APIError` with a numeric
 * `.status` field. Auth/RateLimit/Abort have dedicated subclasses, but we
 * pattern-match on shape rather than instanceof so this stays mockable.
 */
export function mapOpenAIError(
  err: unknown,
  logPrefix: string,
  timeoutMs: number,
): ResearchError {
  const e = err as { name?: string; status?: number; message?: string } | undefined;
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") {
    return new ResearchError(
      "timeout",
      `${logPrefix} call timed out after ${timeoutMs}ms`,
      { cause: err },
    );
  }
  if (e?.status === 401) {
    return new ResearchError("auth_error", `Invalid ${logPrefix} API key`, { cause: err });
  }
  if (e?.status === 429) {
    return new ResearchError("rate_limit", `${logPrefix} rate limit hit`, { cause: err });
  }
  if (typeof e?.status === "number") {
    return new ResearchError(
      "model_error",
      `${logPrefix} API error (${e.status}): ${e.message ?? ""}`,
      { cause: err },
    );
  }
  return new ResearchError(
    "model_error",
    `Unexpected ${logPrefix} error: ${(err as Error)?.message ?? String(err)}`,
    { cause: err },
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
npm test -- shared-openai-helpers
```

Expected: PASS.

- [ ] **Step 5: Run all shared.ts tests to confirm no regression**

Run:
```bash
npm test -- shared-extract-json shared-openai-helpers
```

Expected: PASS for both.

- [ ] **Step 6: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm/shared.ts __tests__/shared-openai-helpers.test.ts
git commit -m "feat(llm): add parseFinalOpenAI + mapOpenAIError helpers"
```

---

## Task 7: Add `openaiToolDef()` helper to `tools/exa-search.ts`

**Files:**
- Modify: `src/lib/llm/tools/exa-search.ts`
- Modify: `__tests__/exa-search-tool.test.ts`

- [ ] **Step 1: Write failing test**

Append to `__tests__/exa-search-tool.test.ts`:

```ts
import { openaiExaToolDef } from "@/lib/llm/tools/exa-search";

describe("openaiExaToolDef", () => {
  it("emits an OpenAI function-tool definition with strict json schema", () => {
    const def = openaiExaToolDef();
    expect(def.type).toBe("function");
    expect(def.function.name).toBe("exa_search");
    expect(def.function.parameters.type).toBe("object");
    expect(def.function.parameters.required).toEqual(["query"]);
    expect(def.function.parameters.properties.query.type).toBe("string");
    expect(def.function.parameters.properties.num_results.type).toBe("integer");
    // Description carries through so the model gets the same guidance.
    expect(def.function.description).toMatch(/Search the public web/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm test -- exa-search-tool
```

Expected: FAIL — `openaiExaToolDef` is not exported.

- [ ] **Step 3: Add helper to `src/lib/llm/tools/exa-search.ts`**

Append at the bottom of the file:

```ts
/**
 * OpenAI-compat tool definition for the Kimi adapter. Same name + schema as
 * EXA_SEARCH_TOOL so the rest of the code path (handleExaSearch) stays shared.
 */
export function openaiExaToolDef() {
  return {
    type: "function" as const,
    function: {
      name: EXA_SEARCH_TOOL.name,
      description: EXA_SEARCH_TOOL.description,
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const },
          num_results: {
            type: "integer" as const,
            default: 5,
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["query"] as const,
        additionalProperties: false,
      },
    },
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
npm test -- exa-search-tool
```

Expected: PASS.

- [ ] **Step 5: Type check + commit**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

```bash
git add src/lib/llm/tools/exa-search.ts __tests__/exa-search-tool.test.ts
git commit -m "feat(llm): add openaiExaToolDef helper for Kimi tool surface"
```

---

## Task 8: Rewrite `src/lib/llm/adapters/kimi.ts` against the OpenAI SDK

This is the core change. Test-first using the new test file, then implement.

**Files:**
- Create: `__tests__/kimi-openai-adapter.test.ts`
- Modify: `src/lib/llm/adapters/kimi.ts` (full rewrite)
- Modify: `__tests__/exa-budget.test.ts` (drop the Kimi block — it lives in the new test file)

### Sub-task 8a — Tests for tier mapping, json_schema, prompt_cache_key

- [ ] **Step 1: Create `__tests__/kimi-openai-adapter.test.ts` with tier + cache + schema tests**

```ts
// Unit tests for the OpenAI-compat Kimi adapter (api.moonshot.ai/v1).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { RunArgs } from "@/lib/llm/types";
import { EXA_BUDGET } from "@/lib/llm/types";

// ---------------------------------------------------------------------------
// Track every chat.completions.create call.
// ---------------------------------------------------------------------------
type RecordedCall = {
  params: Record<string, unknown>;
  options?: Record<string, unknown>;
};
const sdkCalls: RecordedCall[] = [];

// Sequence of fake responses to return on each successive create() call.
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

// Optional error injector — when set, the next create() throws.
let nextCreateError: unknown = null;

// EXA hit recorder — set by the openai mock factory below for shared scoping.
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
    constructor(_opts: unknown) {
      this.chat = {
        completions: {
          create: async (params: unknown, options?: unknown) => {
            sdkCalls.push({
              params: params as Record<string, unknown>,
              options: options as Record<string, unknown> | undefined,
            });
            if (nextCreateError !== null) {
              const e = nextCreateError;
              nextCreateError = null;
              throw e;
            }
            const resp = chatResponseSequence[chatResponseIndex++];
            if (!resp) {
              // Default: end the loop with a generic stop response.
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

// Helpers ----------------------------------------------------------------------

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
  exaHits.length = 0;
  chatResponseSequence = [];
  chatResponseIndex = 0;
  nextCreateError = null;
});

// Tier + config tests ----------------------------------------------------------

describe("Kimi adapter — tier mapping", () => {
  it("default tier → kimi-k2-0905-preview, temperature 0.2, max_tokens 8192, no thinking", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2-0905-preview")];
    await runKimi(makeArgs("default"));
    expect(sdkCalls).toHaveLength(1);
    const p = sdkCalls[0].params;
    expect(p.model).toBe("kimi-k2-0905-preview");
    expect(p.temperature).toBe(0.2);
    expect(p.max_tokens).toBe(8192);
    expect(p.thinking).toBeUndefined();
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

// json_schema + prompt_cache_key -----------------------------------------------

describe("Kimi adapter — strict json_schema + cache key", () => {
  it("passes prompt_cache_key from RunArgs.cacheKey", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2-0905-preview")];
    await runKimi(makeArgs("default"));
    const p = sdkCalls[0].params;
    expect(p.prompt_cache_key).toBe("founderscope:section:snapshot");
  });

  it("emits response_format json_schema strict from the Zod schema", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2-0905-preview")];
    await runKimi(makeArgs("default"));
    const p = sdkCalls[0].params as Record<string, unknown>;
    const rf = p.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: { type: string } };
    };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.name).toBe("snapshot"); // last colon-segment of cacheKey
    expect(rf.json_schema.schema.type).toBe("object");
  });

  it("falls back json_schema name to 'section' when cacheKey is missing", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2-0905-preview")];
    await runKimi({ ...makeArgs("default"), cacheKey: undefined });
    const p = sdkCalls[0].params as Record<string, unknown>;
    const rf = p.response_format as { json_schema: { name: string } };
    expect(rf.json_schema.name).toBe("section");
    expect(p.prompt_cache_key).toBeUndefined();
  });

  it("declares the EXA function tool", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [stopResponse("kimi-k2-0905-preview")];
    await runKimi(makeArgs("default"));
    const p = sdkCalls[0].params as Record<string, unknown>;
    const tools = p.tools as Array<{ type: string; function: { name: string } }>;
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("function");
    expect(tools[0].function.name).toBe("exa_search");
  });

  it("uses base URL https://api.moonshot.ai/v1 and disables SDK retries", async () => {
    // Spy via re-mocking would be intrusive — instead, the env hint is implicit:
    // the adapter constructs `new OpenAI({ baseURL, maxRetries: 0 })`. Assert by
    // inspecting the default export on first call: capture the constructor opts.
    // The mock above stores nothing about constructor opts; extend if needed.
    // For this test we trust the adapter source for now and document the hand-off
    // — Task 8 implementation step explicitly sets these.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Add a constructor-opts spy to the mock**

Update the openai mock factory in the same file to record constructor options:

```ts
const openaiCtorOpts: unknown[] = [];

vi.mock("openai", () => {
  // ...same error classes as before...
  class MockOpenAI {
    chat: { completions: { create: (params: unknown, options?: unknown) => Promise<unknown> } };
    constructor(opts: unknown) {
      openaiCtorOpts.push(opts);
      this.chat = { /* ...same as before... */ };
    }
  }
  return { default: MockOpenAI, OpenAI: MockOpenAI, APIError, APIUserAbortError, AuthenticationError, RateLimitError };
});
```

And replace the placeholder `expect(true).toBe(true)` test with a real assertion:

```ts
  it("uses base URL https://api.moonshot.ai/v1 and disables SDK retries", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    openaiCtorOpts.length = 0;
    chatResponseSequence = [stopResponse("kimi-k2-0905-preview")];
    await runKimi(makeArgs("default"));
    expect(openaiCtorOpts).toHaveLength(1);
    const opts = openaiCtorOpts[0] as { baseURL?: string; maxRetries?: number; apiKey?: string };
    expect(opts.baseURL).toBe("https://api.moonshot.ai/v1");
    expect(opts.maxRetries).toBe(0);
    expect(opts.apiKey).toBe("km-test");
  });
```

- [ ] **Step 3: Run tests — expect FAIL**

Run:
```bash
npm test -- kimi-openai-adapter
```

Expected: FAIL — adapter still imports `@anthropic-ai/sdk`.

### Sub-task 8b — Implement the new adapter

- [ ] **Step 4: Replace `src/lib/llm/adapters/kimi.ts` entirely**

```ts
// Kimi adapter — runs against Moonshot's OpenAI-compatible endpoint
// (https://api.moonshot.ai/v1) using the `openai` SDK. Tool surface is
// EXA only; Kimi's $web_search builtin is intentionally rejected (see
// docs/superpowers/specs/2026-05-10-kimi-k26-optimization-design.md).
//
// selectProvider() guarantees exaKey is set when execution reaches here.
import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RunArgs, RunResult, ModelTier } from "../types";
import { EXA_BUDGET } from "../types";
import { ResearchError } from "../errors";
import { handleExaSearch, openaiExaToolDef } from "../tools/exa-search";
import { mapOpenAIError, parseFinalOpenAI, withRetry } from "../shared";

const TIMEOUT_MS = 120_000;
const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
const MAX_TURNS = 16;
const isDev = process.env.NODE_ENV !== "production";

// Per-tier model + sampling. Default tier uses k2-0905-preview (256k context,
// no thinking); reasoning tier uses k2.6 (262k context, thinking ON, force
// temperature=1.0 — so we omit the field).
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
  return {
    model: "kimi-k2-0905-preview",
    max_tokens: 8192,
    temperature: 0.2,
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
    maxRetries: 0, // we drive retries via withRetry
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Strict json_schema generated from the section's Zod schema. The name field
  // is conventionally the last colon-segment of cacheKey ("snapshot", "moat", ...).
  // Falls back to "section" when no cacheKey is provided.
  const schemaName = cacheKey?.split(":").pop() || "section";
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  const responseFormat = {
    type: "json_schema" as const,
    json_schema: {
      name: schemaName,
      strict: true,
      schema: jsonSchema,
    },
  };

  const tools = [openaiExaToolDef()];
  // OpenAI message types — `unknown[]` is fine here; the SDK validates shape.
  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: prompt },
  ];

  let response!: {
    id?: string;
    model?: string;
    choices: Array<{
      index?: number;
      finish_reason?: string;
      message: {
        role?: string;
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  let safety = 0;
  const exaBudget = { used: 0 };

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
        response_format: responseFormat,
      };
      if (cfg.temperature !== undefined) params.temperature = cfg.temperature;
      if (cfg.thinking) params.thinking = cfg.thinking;
      if (cacheKey) params.prompt_cache_key = cacheKey;

      try {
        // The OpenAI SDK accepts an extra options arg for { signal }.
        response = await client.chat.completions.create(
          params as Parameters<typeof client.chat.completions.create>[0],
          { signal: controller.signal },
        ) as unknown as typeof response;
      } catch (err) {
        throw mapOpenAIError(err, "Kimi", TIMEOUT_MS);
      }

      const choice = response.choices?.[0];
      const finish = choice?.finish_reason;
      const message = choice?.message;

      if (finish === "stop" || finish === "length") {
        break;
      }

      if (finish === "tool_calls") {
        const toolCalls = message?.tool_calls ?? [];
        if (toolCalls.length === 0) {
          // Defensive: tool_calls finish_reason but no tool_calls payload.
          throw new ResearchError(
            "model_error",
            "Kimi returned finish_reason=tool_calls with no tool_calls",
            {},
          );
        }
        // Reject any unknown tool BEFORE running EXA — otherwise its tool
        // result would silently be missing on the next request and Moonshot
        // would 400 the call.
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

        // Append the assistant message verbatim (must include tool_calls).
        messages.push({
          role: "assistant",
          content: message?.content ?? null,
          tool_calls: toolCalls,
        });

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
            const content = await handleExaSearch(parsedArgs, config.exaKey!);
            return {
              role: "tool" as const,
              tool_call_id: call.id,
              content,
            };
          }),
        );
        // Advance by how many were within budget — overflow calls don't count
        // because they didn't actually hit EXA.
        exaBudget.used += Math.min(
          toolCalls.length,
          Math.max(0, budget - exaBudget.used),
        );

        for (const reply of toolReplies) {
          messages.push(reply);
        }
        continue;
      }

      // Any other finish_reason: bail out and let parseFinalOpenAI surface a
      // schema_validation / model_error from whatever content we got.
      break;
    }
  } finally {
    clearTimeout(timer);
  }

  return parseFinalOpenAI(response, schema, cfg.model, "kimi");
}
```

- [ ] **Step 5: Run the new tests — expect PASS**

Run:
```bash
npm test -- kimi-openai-adapter
```

Expected: PASS for tier mapping, prompt_cache_key, json_schema, base URL.

- [ ] **Step 6: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

### Sub-task 8c — Tool loop, errors, MAX_TURNS, EXA budget tests

- [ ] **Step 7: Append tool-loop, error-mapping, EXA-budget tests to `__tests__/kimi-openai-adapter.test.ts`**

Append below the previous test blocks:

```ts
describe("Kimi adapter — tool loop", () => {
  it("dispatches exa_search tool calls and continues until finish_reason=stop", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2-0905-preview", [
        { id: "tc-1", name: "exa_search", args: { query: "stripe payments" } },
      ]),
      stopResponse("kimi-k2-0905-preview"),
    ];
    const result = await runKimi(makeArgs("default"));
    expect(result.data).toEqual({ ok: true });
    expect(exaHits).toEqual(["stripe payments"]);
    // First call: 1 user msg. Second call: user + assistant(tool_calls) + tool reply.
    expect(sdkCalls).toHaveLength(2);
    const secondMessages = (sdkCalls[1].params.messages as Array<{ role: string }>);
    expect(secondMessages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("rejects unknown tool calls with model_error", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2-0905-preview", [
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
    // 17 tool-call turns (one more than MAX_TURNS) → adapter aborts.
    chatResponseSequence = Array.from({ length: 17 }, (_, i) =>
      toolCallResponse("kimi-k2-0905-preview", [
        { id: `tc-${i}`, name: "exa_search", args: { query: `q-${i}` } },
      ]),
    );
    await expect(runKimi(makeArgs("default"))).rejects.toMatchObject({
      category: "model_error",
      message: expect.stringMatching(/exceeded max tool turns/),
    });
  });
});

describe("Kimi adapter — EXA budget enforcement", () => {
  it("default tier caps at budget=8 even when 12 calls are made (3 turns × 4)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    chatResponseSequence = [
      toolCallResponse("kimi-k2-0905-preview", [
        { id: "a1", name: "exa_search", args: { query: "q1" } },
        { id: "a2", name: "exa_search", args: { query: "q2" } },
        { id: "a3", name: "exa_search", args: { query: "q3" } },
        { id: "a4", name: "exa_search", args: { query: "q4" } },
      ]),
      toolCallResponse("kimi-k2-0905-preview", [
        { id: "b1", name: "exa_search", args: { query: "q5" } },
        { id: "b2", name: "exa_search", args: { query: "q6" } },
        { id: "b3", name: "exa_search", args: { query: "q7" } },
        { id: "b4", name: "exa_search", args: { query: "q8" } },
      ]),
      toolCallResponse("kimi-k2-0905-preview", [
        { id: "c1", name: "exa_search", args: { query: "q9" } },
        { id: "c2", name: "exa_search", args: { query: "q10" } },
        { id: "c3", name: "exa_search", args: { query: "q11" } },
        { id: "c4", name: "exa_search", args: { query: "q12" } },
      ]),
      stopResponse("kimi-k2-0905-preview"),
    ];
    await runKimi(makeArgs("default"));
    expect(exaHits.length).toBe(EXA_BUDGET.default);
  });

  it("reasoning tier caps at budget=10", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    // 4 turns × 4 calls = 16 → budget 10 caps it.
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
      toolCallResponse("kimi-k2-0905-preview", [
        { id: "x1", name: "exa_search", args: { query: "q1" } },
        { id: "x2", name: "exa_search", args: { query: "q2" } },
        { id: "x3", name: "exa_search", args: { query: "q3" } },
      ]),
      stopResponse("kimi-k2-0905-preview"),
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

  it("maps 429 to rate_limit (and exhausts retries — withRetry retries twice)", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    // withRetry retries on rate_limit/timeout twice (delays [2s, 8s] in shared.ts).
    // Rather than wait 10 seconds, we stub setTimeout? No — the simplest path is
    // to assert the final category. Vitest's default timeout is 5s, so we rely
    // on the `vi.useFakeTimers` switch.
    vi.useFakeTimers();
    try {
      nextCreateError = Object.assign(new Error("Rate"), { status: 429 });
      const promise = runKimi(makeArgs("default"));
      // Drain retries: each attempt re-throws and re-sets the error in the next
      // iteration. Use a setTimeout wrapper on nextCreateError? Easiest: assert
      // the final rejection by advancing all timers.
      const expectation = expect(promise).rejects.toMatchObject({ category: "rate_limit" });
      // The first call already happened synchronously; advance timers to let
      // the two retry delays elapse. Each iteration re-sets nextCreateError.
      // But our mock zeros nextCreateError after one throw — so subsequent
      // attempts succeed and the test would not assert rate_limit. Reset the
      // error inside the create() mock instead.
      // Simplest robust approach: skip retry test here, do a "first error wins"
      // assertion by setting maxRetries semantics. Implement below.
      await vi.runAllTimersAsync();
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps AbortError to timeout", async () => {
    const { runKimi } = await import("@/lib/llm/adapters/kimi");
    nextCreateError = Object.assign(new Error("aborted"), { name: "AbortError" });
    // withRetry also retries on timeout, so apply the same fake-timer approach.
    vi.useFakeTimers();
    try {
      const promise = runKimi(makeArgs("default"));
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toMatchObject({ category: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});
```

Note on the 429 / abort retry tests: the openai mock's `nextCreateError` is single-shot (cleared after one throw). For both retries the next call returns the default stop response, so the final result would actually be a success. Adjust the mock so the error persists for *all* attempts in those two tests — easiest fix is a separate `persistentCreateError` flag:

In the mock, alongside `nextCreateError`, add `let persistentCreateError: unknown = null;` and update the create() handler:

```ts
if (persistentCreateError !== null) throw persistentCreateError;
if (nextCreateError !== null) {
  const e = nextCreateError;
  nextCreateError = null;
  throw e;
}
```

Then update the 429 / abort tests to use `persistentCreateError` instead. Reset `persistentCreateError = null` in `beforeEach`.

- [ ] **Step 8: Run all kimi-openai-adapter tests — expect PASS**

Run:
```bash
npm test -- kimi-openai-adapter
```

Expected: PASS for every test, including the retry ones. If the retry tests time out, double-check the `vi.useFakeTimers` / `runAllTimersAsync` pattern.

### Sub-task 8d — Drop the Kimi block from `exa-budget.test.ts`

The legacy `exa-budget.test.ts` mocks `@anthropic-ai/sdk` for both adapters. With Kimi switched to `openai`, those Kimi tests would now exercise `withRetry` against an Anthropic mock the new adapter never reaches. Move them to the new test file (already done in Step 7) and remove from the old file.

- [ ] **Step 9: Edit `__tests__/exa-budget.test.ts`**

Delete the entire `describe("Kimi adapter — EXA budget enforcement", ...)` block. Keep `describe("EXA_BUDGET constant", ...)` and `describe("Anthropic adapter — EXA budget enforcement (exa backend)", ...)` intact. Also delete the `makeKimiArgs` helper that is no longer referenced.

- [ ] **Step 10: Run the trimmed Anthropic-only file — expect PASS**

Run:
```bash
npm test -- exa-budget
```

Expected: PASS.

- [ ] **Step 11: Type check + run full suite**

Run:
```bash
npx tsc --noEmit
```

Expected: clean.

```bash
npm test
```

Expected: every test file passes.

- [ ] **Step 12: Commit**

```bash
git add src/lib/llm/adapters/kimi.ts __tests__/kimi-openai-adapter.test.ts __tests__/exa-budget.test.ts
git commit -m "refactor(kimi): rewrite adapter against OpenAI-compat endpoint"
```

---

## Task 9: Section-schema → JSON-schema smoke test

Each Zod schema must produce a non-empty JSON Schema with `type: "object"` once handed to `zodToJsonSchema`. This catches obvious MFJS-incompatible patterns (e.g. a top-level `z.union` or a non-object root) early, before live Moonshot calls.

**Files:**
- Create: `__tests__/kimi-json-schema.test.ts`

- [ ] **Step 1: Write test**

```ts
// Smoke test: every section's outputSchema must produce a JSON Schema with
// type=object. MFJS strict mode rejects non-object roots, so this catches
// regressions before they hit Moonshot.
import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SECTIONS } from "@/lib/sections/registry";
import { DisambiguationSchema } from "@/lib/disambiguate";

describe("Kimi json_schema generation", () => {
  for (const section of SECTIONS) {
    it(`${section.key} → object root`, () => {
      const schema = zodToJsonSchema(section.outputSchema, { target: "openApi3" }) as {
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(Object.keys(schema.properties!).length).toBeGreaterThan(0);
    });
  }

  it("disambiguate → object root", () => {
    const schema = zodToJsonSchema(DisambiguationSchema, { target: "openApi3" }) as {
      type?: string;
      properties?: Record<string, unknown>;
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect PASS**

Run:
```bash
npm test -- kimi-json-schema
```

Expected: 8 passing assertions (7 sections + disambiguate). If any section fails, log the failure and address by simplifying the schema OR by listing the section in a follow-up issue per spec §"JSON schema strict mode" — do **not** silently mask it. (Default expectation: all pass.)

- [ ] **Step 3: Commit**

```bash
git add __tests__/kimi-json-schema.test.ts
git commit -m "test(kimi): smoke-test section schemas via zod-to-json-schema"
```

---

## Task 10: Verify `MOCK_RESEARCH=true` still works

The cost guard relies on `MOCK_RESEARCH=true` short-circuiting `route.ts` before any provider is touched. Verify the rewrite did not accidentally break this.

- [ ] **Step 1: Inspect route.ts MOCK_RESEARCH branch**

```bash
grep -n "MOCK_RESEARCH" /Users/abhayp/Downloads/Projects/FounderScope/src/app/api/research/route.ts
```

Expected: line ~48 returns the mock SSE before `selectProvider`. Confirm it still does.

- [ ] **Step 2: Run mock-research test**

Run:
```bash
npm test -- mock-research
```

Expected: PASS.

- [ ] **Step 3: No commit needed if no code changed.** If a fix was required, commit:

```bash
git add src/app/api/research/route.ts
git commit -m "fix(research): preserve MOCK_RESEARCH short-circuit"
```

---

## Task 11: Full verification sweep

- [ ] **Step 1: Type check the whole project**

Run:
```bash
npx tsc --noEmit
```

Expected: exit code 0, no output.

- [ ] **Step 2: Run the entire test suite**

Run:
```bash
npm test
```

Expected: every test file passes. Capture the full output line-count and final summary; the PR description should quote the summary.

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint
```

Expected: clean (warnings allowed if pre-existing; no new errors).

- [ ] **Step 4: Confirm no regressions vs main**

Run:
```bash
git diff --stat main..HEAD -- src/lib/llm/adapters/anthropic.ts
```

Expected: zero or one-line diff. If the file changed beyond accepting `cacheKey` (which it shouldn't have to, since the destructure already drops unknown fields), revisit Task 5.

- [ ] **Step 5: No commit (verification only).**

---

## Task 12: Live smoke test against Moonshot

**Required before claiming done.** Per the spec acceptance criteria, document this in the PR body.

> ⚠️ Live API smoke. The user said: "I will provide a Kimi key when you reach this step — do not invent or hard-code one." Pause here, ask for the key, run the smoke test in a temporary unstaged scratch file, then delete the scratch file.

- [ ] **Step 1: Pause and request the Kimi key**

When this task is reached, ask the user explicitly: *"I'm at the live smoke-test step. Please paste a Kimi API key (it stays in the shell only — I will not commit it). I will run a single small section against Moonshot."*

- [ ] **Step 2: Build a one-section harness as a scratch file**

Create `scripts/smoke-kimi.mjs` (gitignored / scratch — deleted after):

```js
// scripts/smoke-kimi.mjs — TEMPORARY. Delete after smoke test.
// Runs a single small section against Moonshot to verify the adapter
// works end-to-end. Default tier (snapshot) + reasoning tier (moat) +
// repeat call to observe prompt cache hit.
import "dotenv/config";
import { runResearchCall } from "../src/lib/llm/index.js";
import { snapshot } from "../src/lib/sections/snapshot.js";
import { moat } from "../src/lib/sections/moat.js";

const KIMI = process.env.KIMI_API_KEY;
const EXA = process.env.EXA_API_KEY;
if (!KIMI || !EXA) {
  console.error("Set KIMI_API_KEY and EXA_API_KEY env vars before running this script.");
  process.exit(1);
}

const config = {
  provider: "kimi",
  searchBackend: "exa",
  llmKey: KIMI,
  exaKey: EXA,
};
const company = {
  name: "Stripe",
  domain: "stripe.com",
  slug: "stripe",
  one_line_description: "Payments infrastructure for the internet.",
};

console.log("--- Default tier (snapshot, kimi-k2-0905-preview) ---");
const t1 = Date.now();
const r1 = await runResearchCall({
  config,
  tier: snapshot.tier,
  prompt: snapshot.buildPrompt(company),
  schema: snapshot.outputSchema,
  cacheKey: snapshot.cacheKey,
});
console.log({ ms: Date.now() - t1, model: r1.modelVersion });
console.log(JSON.stringify(r1.data, null, 2).slice(0, 1500));

console.log("\n--- Default tier repeat (cache-hit observation) ---");
const t2 = Date.now();
const r2 = await runResearchCall({
  config,
  tier: snapshot.tier,
  prompt: snapshot.buildPrompt(company),
  schema: snapshot.outputSchema,
  cacheKey: snapshot.cacheKey,
});
console.log({ ms: Date.now() - t2, model: r2.modelVersion });

console.log("\n--- Reasoning tier (moat, kimi-k2.6) ---");
const t3 = Date.now();
const r3 = await runResearchCall({
  config,
  tier: moat.tier,
  prompt: moat.buildPrompt(company),
  schema: moat.outputSchema,
  cacheKey: moat.cacheKey,
});
console.log({ ms: Date.now() - t3, model: r3.modelVersion });
console.log(JSON.stringify(r3.data, null, 2).slice(0, 1500));
```

Note: the script imports compiled `.js` paths so we must build first or use `tsx`. The simplest approach is `npx tsx scripts/smoke-kimi.mjs` after renaming to `.ts`. Adjust extension to `.ts` and run with `tsx`.

- [ ] **Step 3: Run the smoke**

```bash
KIMI_API_KEY=<paste> EXA_API_KEY=$EXA_API_KEY npx tsx scripts/smoke-kimi.ts
```

Expected: three blocks of output. Validate:
1. Default-tier snapshot returns valid JSON, `modelVersion === "kimi-k2-0905-preview"`.
2. Repeat default-tier call: latency ~50% lower OR Moonshot's response includes `usage.cached_tokens` / `prompt_cache_hit_tokens` > 0. (Moonshot reports cache hits in `usage`; if the SDK strips them, fall back to comparing latency.)
3. Reasoning-tier moat returns valid JSON, `modelVersion === "kimi-k2.6"`.

- [ ] **Step 4: Capture evidence and delete the scratch file**

Copy the three output blocks into the PR description under a heading "Live smoke evidence". Then:

```bash
rm scripts/smoke-kimi.ts
```

- [ ] **Step 5: If smoke fails** — STOP and re-plan; do not claim done. Surface the error to the user, decide whether to revert, downgrade default tier to `kimi-k2.5`, or fall back the affected section to `response_format: { type: "json_object" }`.

- [ ] **Step 6: If unable to run smoke at all** — say so explicitly per the instructions ("If you cannot run the smoke test, say so explicitly rather than claiming success.") and tag the PR as draft.

- [ ] **Step 7: No commit** — scratch file removed, no source changes.

---

## Task 13: Final completion gate

- [ ] **Step 1: Re-run full verification**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: all clean.

- [ ] **Step 2: Confirm acceptance criteria from spec are met**

Walk through the spec's "Acceptance criteria" checklist and tick each item:

- `kimi.ts` rewritten — Task 8.
- `openai` package — Task 1.
- `RunArgs.cacheKey` — Task 2.
- 7 sections with `cacheKey` — Task 3.
- `disambiguate.ts` cacheKey — Task 4.
- Tier mapping default→`kimi-k2-0905-preview`, reasoning→`kimi-k2.6` thinking — Task 8 + tests.
- `response_format: json_schema` strict — Task 8 + tests.
- `maxRetries: 0` — Task 8 + tests.
- EXA tool surface unchanged + budget — Task 8 + tests + Task 9.
- All vitest tests pass — Task 11.
- Smoke test — Task 12.
- Anthropic-only no behavior change — Task 5 (regression test) + Task 11 (full suite).
- No new env vars / DB migration — verified.

- [ ] **Step 3: Open PR**

PR title: `refactor(kimi): rewrite adapter against OpenAI-compat endpoint, add prompt cache + json_schema strict`

PR body includes:
- Summary (1–3 bullets) referencing the spec link.
- `Live smoke evidence` block from Task 12.
- Test plan checklist (full suite passing, tsc clean, smoke OK).
- Note that `MOCK_RESEARCH=true` was verified.

---

## Self-Review Checklist (run after writing the plan)

- [x] Spec coverage — every acceptance criterion is mapped to a task above.
- [x] No placeholders — every step shows actual code, exact commands, expected output.
- [x] Type consistency — `cacheKey` is the same name in `RunArgs`, `SectionDefinition`, route, disambiguate, and Kimi adapter; helper names (`parseFinalOpenAI`, `mapOpenAIError`, `openaiExaToolDef`) are used consistently across tasks.
- [x] Anthropic adapter is touched only by a regression test, never modified — explicit per spec and CLAUDE.md guidance.
- [x] EXA stays — no Kimi `$web_search` anywhere in the plan.
- [x] Cost guard preserved — `MOCK_RESEARCH=true` short-circuit verified in Task 10.
- [x] Live smoke is gated on user key, not auto-run.
