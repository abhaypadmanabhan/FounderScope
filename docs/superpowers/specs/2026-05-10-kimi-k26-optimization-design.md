# Kimi K2.6 Optimization — Design

**Date:** 2026-05-10
**Status:** Draft (awaiting user review)
**Branch target:** `phase-3/foundation-slice` (or new branch `phase-3/kimi-k26-optimization`)
**Prior art:** [`2026-05-10-kimi-exa-support-design.md`](./2026-05-10-kimi-exa-support-design.md) — this spec supersedes the Kimi adapter portion of that work.

---

## Context

Current Kimi adapter (`src/lib/llm/adapters/kimi.ts`) routes through the Anthropic-compat endpoint (`https://api.moonshot.ai/anthropic`) using `@anthropic-ai/sdk`. Research (2026-05-10) revealed:

1. **Anthropic-compat endpoint is barely documented.** Only `kimi-k2.5` is officially confirmed. K2.6 unverified. No documentation for `prompt_cache_key`, `response_format` json_schema, thinking-mode pass-through, or the `$web_search` builtin tool. Single docs page exists ([`agent-support.md`](https://platform.kimi.ai/docs/guide/agent-support.md)) and it's positioned as a Claude-Code-compat shim, not a feature-complete surface.
2. **OpenAI-compat endpoint (`https://api.moonshot.ai/v1`) is the primary, fully-featured surface.** Every documented Kimi feature works there: K2.6 first-class, `response_format: json_schema` strict (MFJS dialect), `prompt_cache_key` (input cost ~6× cheaper on cache hit), parallel tool calls, thinking control.
3. **Kimi `$web_search` builtin is unfit for company research.** No domain/date filters, search-result tokens billed as input (one example: 13,046 tokens / single search), incompatible with K2.6 thinking mode. EXA wins on quality, latency, uptime, and cost for the structured 7-section research workflow.

We want to:

- Get full Kimi K2.6 feature access (thinking mode, prompt cache, json_schema strict).
- Drop dependence on the Anthropic SDK for Kimi calls.
- Keep EXA as the search backend — `$web_search` is intentionally rejected.
- Leave the Anthropic adapter and Anthropic-key-only users untouched.

---

## Goals

- Rewrite `src/lib/llm/adapters/kimi.ts` against `openai` SDK pointed at `https://api.moonshot.ai/v1`.
- Tier split: `kimi-k2.6` for `reasoning` tier (thinking ON), `kimi-k2-0905-preview` for `default` tier (cheaper, no thinking, faster).
- Use `response_format: { type: "json_schema", json_schema: { strict: true, ... } }` derived from each section's Zod schema. On the Kimi path, skip the regex-based `extractJson` fallback — strict mode guarantees clean JSON.
- Use `prompt_cache_key` keyed on the section identifier (e.g., `"founderscope:section:founders"`) to share prefix cache across companies.
- Keep EXA as a function tool. Kimi adapter still requires EXA key (`selectProvider` invariant unchanged).
- All 7 existing sections work without prompt or schema changes.
- No behavior change for Anthropic-only users.

---

## Non-Goals

- Kimi `$web_search`, `code_runner`, or any other Moonshot builtin tool.
- Firecrawl `/scrape` second-stage tool (deferred — see Open Questions).
- Adding other OpenAI-compat providers (DeepSeek, Minimax). Architecture must not paint us into a corner, but no implementation this slice.
- Migrating the Anthropic adapter.
- Streaming Kimi token output to the client (sections still stream final JSON; tool turns stay server-internal).
- Per-section provider override.

---

## Architecture

```
src/lib/llm/
  index.ts                   unchanged public surface
  provider.ts                unchanged (Kimi still requires EXA)
  types.ts                   add CACHE_KEY_PREFIX constant; otherwise unchanged
  errors.ts                  unchanged
  shared.ts                  add parseFinalOpenAI(), mapOpenAIError(); keep Anthropic helpers
  adapters/
    anthropic.ts             unchanged
    kimi.ts                  REWRITE — uses `openai` SDK, OpenAI-compat endpoint
  tools/
    exa-search.ts            add openaiToolDef() helper that emits OpenAI's tool schema
    exa-client.ts            unchanged
```

`src/lib/sections/types.ts` — add `cacheKey: string` field to `SectionDefinition` (e.g., `"founderscope:section:founders"`). Each section sets it; both adapters read it from `RunArgs.cacheKey` (Anthropic ignores it for now; Kimi passes to `prompt_cache_key`).

### Routing matrix (unchanged)

| Anthropic | Kimi | EXA | LLM | Search |
|-----------|------|-----|-----|--------|
| ✓ | — | ✗ | Anthropic | Native `web_search` |
| ✓ | — | ✓ | Anthropic | EXA function tool |
| ✗ | ✓ | ✓ | **Kimi (OpenAI-compat)** | EXA function tool |
| ✗ | ✓ | ✗ | reject (`missing_search_key`) | — |
| ✗ | ✗ | * | reject (`missing_api_key`) | — |

Anthropic still wins ties (both keys present → Anthropic).

---

## Kimi adapter — detailed design

### Dependencies

- Add `openai` (latest, ≥ 4.x) to `package.json`. Already have `zod-to-json-schema@^3.25.2`.
- Do **not** remove `@anthropic-ai/sdk` — Anthropic adapter still needs it.

### Model + tier mapping

```ts
const MODELS: Record<ModelTier, string> = {
  default: "kimi-k2-0905-preview", // 256k ctx, $0.60/M in (miss), $0.15/M (hit), $2.50/M out
  reasoning: "kimi-k2.6",          // 262k ctx, $0.95/M in (miss), $0.16/M (hit), $4.00/M out, thinking ON by default
};
```

Why `kimi-k2-0905-preview` (not `kimi-k2.5`) for default? Same per-token pricing as k2.5 ($0.60/$2.50) but newer training cutoff and 256k context. K2.5 stays as a fallback if K2-0905 has stability issues.

`kimi-k2-thinking` and `kimi-k2-turbo-preview` are not used this slice. Could be wired in later (turbo for ultra-fast disambiguate; thinking-turbo if K2.6 thinking proves unreliable).

### Per-tier config

```ts
function tierConfig(tier: ModelTier) {
  if (tier === "reasoning") {
    return {
      model: "kimi-k2.6",
      max_tokens: 16384,
      thinking: { type: "enabled" as const }, // K2.6 default; explicit for clarity
      // K2.6 forces temperature=1.0 when thinking is on — do not pass temperature
    };
  }
  return {
    model: "kimi-k2-0905-preview",
    max_tokens: 8192,
    temperature: 0.2,
    // No thinking field — k2-0905 doesn't support it
  };
}
```

### JSON schema strict mode

Per [Chat API docs](https://platform.kimi.ai/docs/api/chat.md), `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` constrains output to MFJS-dialect schemas.

Generate schema from each section's Zod via `zod-to-json-schema`:

```ts
import { zodToJsonSchema } from "zod-to-json-schema";

const jsonSchema = zodToJsonSchema(args.schema, { target: "openApi3" });
const responseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: args.cacheKey?.split(":").pop() ?? "section",
    strict: true,
    schema: jsonSchema,
  },
};
```

**Risk:** MFJS is a Moonshot-flavored subset. Some Zod features (refinements, transforms, unions) may not round-trip. Mitigation:

- Sanity-test each section's generated schema against Moonshot during implementation.
- If a section's schema fails MFJS validation, fall back to `response_format: { type: "json_object" }` for that section, plus include schema in the prompt as today. Track which sections fall back; revisit later.
- Keep `parseFinalOpenAI` defensive — even with strict mode, run `JSON.parse` and `schema.safeParse` as a guard. If parse succeeds, skip `extractJson`. If parse fails, run `extractJson` once before erroring. (Belt-and-suspenders during the rollout; can simplify after stability is proven.)

### Prompt caching

Plumb `cacheKey` through `RunArgs`:

```ts
// types.ts
export interface RunArgs<T> {
  config: ProviderConfig;
  tier: ModelTier;
  prompt: string;
  schema: ZodType<T>;
  cacheKey?: string; // NEW — only Kimi uses this for now
}
```

- Each `SectionDefinition` exposes a stable `cacheKey: "founderscope:section:<key>"`.
- `disambiguate.ts` passes `cacheKey: "founderscope:disambiguate"`.
- `route.ts` reads `section.cacheKey` and passes it to `runResearchCall`.
- Kimi adapter passes it as `prompt_cache_key` on every call. Anthropic adapter ignores it.

Cache hits across companies: yes — the section prompt has a long stable preamble (instructions, schema example) and a short variable suffix (company name/domain). Moonshot caches the matched prefix. Net: ~6× input-cost reduction on warm cache.

### Tool-use loop

OpenAI-compat tool format differs from Anthropic. Per [Tool Use API](https://platform.kimi.ai/docs/api/tool-use.md):

```ts
// 1. Send tools array
const tools = [{
  type: "function",
  function: {
    name: "exa_search",
    description: EXA_SEARCH_TOOL.description,
    parameters: EXA_SEARCH_TOOL.input_schema, // shape is identical
    strict: true, // optional but recommended
  },
}];

// 2. On response: check choices[0].finish_reason === "tool_calls"
// 3. choices[0].message.tool_calls is an array of { id, type:"function", function: { name, arguments: string } }
// 4. JSON.parse(arguments), call handleExaSearch, push results back as:
messages.push(assistantMessage); // includes tool_calls
for (const call of toolCalls) {
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: await handleExaSearch(JSON.parse(call.function.arguments), exaKey),
  });
}
// 5. Loop until finish_reason === "stop"
```

Loop guards (preserve current behavior):
- `MAX_TURNS = 16` (same as today's Kimi adapter).
- EXA budget enforced via `EXA_BUDGET[tier]` (`default: 8`, `reasoning: 10`).
- Synthetic budget-exhausted tool result returned without calling EXA when over budget (same pattern as today).
- Reject any `tool_calls` entry with `function.name !== "exa_search"` — throw `ResearchError("model_error", "Kimi invoked unsupported tool: <name>")`.

### Error mapping

`shared.ts` adds `mapOpenAIError(err, "Kimi", TIMEOUT_MS)`:
- `OpenAI.APIUserAbortError` / `AbortError` → `ResearchError("timeout", ...)`
- `OpenAI.AuthenticationError` (status 401) → `ResearchError("auth_error", "Invalid Kimi API key")`
- `OpenAI.RateLimitError` (status 429) → `ResearchError("rate_limit", ...)`
- `OpenAI.APIError` → `ResearchError("model_error", ...)`
- Other → `ResearchError("model_error", "Unexpected Kimi error: ...")`

`withRetry` in `shared.ts` is provider-agnostic and is reused as-is.

### Timeouts

`TIMEOUT_MS = 120_000` (same as today). Reasoning tier with thinking can take 60–90s; 120s gives headroom.

### Disabled retries on the OpenAI SDK

Per [Moonshot FAQ](https://platform.kimi.ai/docs/guide/faq.md), the OpenAI SDK auto-retries can amplify a single failure into 2–3 calls. Set `maxRetries: 0` on the OpenAI client; let our `withRetry` (with deliberate 2s/8s delays on rate_limit/timeout only) drive retries.

```ts
const client = new OpenAI({
  apiKey: config.llmKey,
  baseURL: "https://api.moonshot.ai/v1",
  maxRetries: 0,
});
```

---

## Section + route plumbing

### `SectionDefinition` gets `cacheKey`

```ts
// src/lib/sections/types.ts
export interface SectionDefinition<T> {
  key: string;
  cacheKey: string; // NEW: stable Moonshot prompt_cache_key (e.g., "founderscope:section:founders")
  tier: ModelTier;
  buildPrompt: (input: CompanyInput) => string;
  outputSchema: ZodType<T>;
  // ...existing fields
}
```

Each of the 7 section files sets `cacheKey: "founderscope:section:<key>"`. `lib/disambiguate.ts` passes `cacheKey: "founderscope:disambiguate"`.

### `route.ts` change

Single line: `runResearchCall({ config, tier: section.tier, prompt: basePrompt, schema: section.outputSchema, cacheKey: section.cacheKey })`.

### Anthropic adapter change

Accept `args.cacheKey` (ignore). No behavior change.

---

## Testing

### Unit tests (vitest)

New tests:
- `__tests__/kimi-openai-adapter.test.ts` — mock `openai` SDK, verify:
  - Default tier → `kimi-k2-0905-preview`, no thinking field, `temperature: 0.2`, `max_tokens: 8192`.
  - Reasoning tier → `kimi-k2.6`, `thinking: { type: "enabled" }`, `max_tokens: 16384`, no temperature.
  - `prompt_cache_key` matches `args.cacheKey`.
  - `response_format.json_schema.strict === true` and the schema matches `zodToJsonSchema(args.schema)`.
  - Tool loop: `finish_reason: "tool_calls"` → calls `handleExaSearch`, pushes `role: "tool"` reply, loops; `finish_reason: "stop"` → parses and returns.
  - EXA budget: 9th call (default tier, budget 8) returns synthetic exhausted result without hitting EXA.
  - Unknown tool name → `ResearchError("model_error", /unsupported/)`.
  - 401 → `auth_error`; 429 → `rate_limit`; abort → `timeout`.
  - `MAX_TURNS = 16` exceeded → `ResearchError("model_error", /max tool turns/)`.
- `__tests__/kimi-json-schema.test.ts` — for each section schema, generate via `zodToJsonSchema` and verify it produces a non-empty schema with `type: "object"` (smoke; live MFJS validation happens against Moonshot during implementation).

Updated tests:
- `__tests__/provider-select.test.ts` — no change (routing unchanged).
- `__tests__/research.test.ts` — if it asserts adapter shape, update for new RunArgs.cacheKey field.
- `__tests__/section-fixtures.test.ts` — add `cacheKey` assertion per section.

### Manual smoke test (required before merge)

Live call against Moonshot using a real Kimi key on a small section (`tech_stack` or `snapshot`):

1. Default tier — verify `kimi-k2-0905-preview` accepts json_schema strict + EXA tool loop end-to-end.
2. Reasoning tier — verify `kimi-k2.6` returns `reasoning_content` (logged) and final JSON parses.
3. Repeat call — verify `prompt_cache_key` produces lower input_tokens billed (check `usage.prompt_cache_hit_tokens` or equivalent in response).

Document smoke-test results in PR description.

---

## Cost model

Per-research (7 sections + 1 disambiguate, ~3k input prompt average, ~1k output average, EXA: ~5 searches/section × $0.007 = $0.035/section):

| Path | Input cost (cold) | Input cost (warm cache) | Output cost | EXA | Total (warm) |
|------|------------------|-------------------------|-------------|-----|--------------|
| Anthropic Haiku 4.5 + EXA | ~$0.024 | n/a | ~$0.040 | ~$0.245 | ~$0.31 |
| Kimi K2.6 + EXA (today, Anthropic-compat) | ~$0.022 | n/a | ~$0.032 | ~$0.245 | ~$0.30 |
| **Kimi K2-0905 + EXA (this spec, default tier, warm)** | **~$0.022 cold / ~$0.0035 warm** | **~$0.0035** | **~$0.020** | **~$0.245** | **~$0.27 cold, ~$0.25 warm** |
| **Kimi K2.6 + EXA (this spec, reasoning tier, warm)** | **~$0.022 cold / ~$0.0037 warm** | **~$0.0037** | **~$0.032** | **~$0.245** | **~$0.30 cold, ~$0.28 warm** |

Numbers approximate. The dominant cost is EXA, not LLM tokens — so the headline win isn't dollar savings; it's:
1. Better JSON reliability (strict schema kills parse-failure retries → fewer wasted calls → silent cost win).
2. K2.6 thinking on the moat section (better moat scores).
3. Independent of Anthropic SDK quirks on the Anthropic-compat path (stability).

---

## Migration / rollout

1. Land this spec, branch off.
2. Implement adapter + tests behind no flag — Kimi-key users get the new path immediately on next deploy.
3. Smoke-test live before merging.
4. Monitor first 5–10 real Kimi runs in production logs for: parse failures, MFJS schema rejections, cache-hit ratios, thinking timeouts.
5. If any section consistently fails MFJS strict, drop to `json_object` for that section (already in adapter as fallback). Track in a follow-up issue.

No DB migration. No env-var change. No breaking API change.

---

## Open questions (deferred)

- **Firecrawl `/scrape` as second-stage tool.** EXA returns thin contents on some long-form pages. Adding a second tool `firecrawl_scrape(url)` that the model can call to fetch clean markdown for a single URL would lift moat-section quality. Out of scope this slice; revisit after measuring how often EXA contents are too thin in practice.
- **Other providers (DeepSeek, Minimax).** The new Kimi adapter is OpenAI-compat; adding another OpenAI-compat provider is largely a new model map + base URL. Not built this slice; design leaves room.
- **Prompt cache for Anthropic too.** Anthropic supports `cache_control` blocks. We could mirror the same `cacheKey` field for Anthropic in a follow-up. Not this slice.
- **`response_format` on Anthropic.** Anthropic doesn't have a strict-JSON mode, but the new beta tool `output_schema` is similar. Out of scope.

---

## Acceptance criteria

- [ ] `src/lib/llm/adapters/kimi.ts` rewritten against `openai` SDK + `https://api.moonshot.ai/v1`.
- [ ] `openai` package added.
- [ ] `RunArgs.cacheKey?: string` field added; threaded from `SectionDefinition.cacheKey` through `route.ts`.
- [ ] All 7 sections have `cacheKey: "founderscope:section:<key>"`.
- [ ] `disambiguate.ts` passes `cacheKey: "founderscope:disambiguate"`.
- [ ] Tier mapping: `default → kimi-k2-0905-preview`, `reasoning → kimi-k2.6` with `thinking.enabled`.
- [ ] `response_format: json_schema` strict generated from each Zod schema; `extractJson` skipped on Kimi path unless `JSON.parse` fails.
- [ ] OpenAI SDK `maxRetries: 0` set; existing `withRetry` is the only retry layer.
- [ ] EXA tool surface unchanged; budget enforcement preserved.
- [ ] All existing vitest tests pass; new Kimi adapter tests pass.
- [ ] Smoke-test against live Moonshot succeeds for at least one default-tier section and one reasoning-tier section; cache hit observed on second identical call.
- [ ] Anthropic-only users see no behavior change (regression test or manual verification).
- [ ] No new env vars; no DB migration.
