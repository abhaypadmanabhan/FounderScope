# Kimi + EXA Support — Design

**Date:** 2026-05-10
**Status:** Approved (design)
**Branch target:** `phase-3/foundation-slice` (next slice after Track A/Vercel deploy)

## Context

FounderScope today is tightly coupled to `@anthropic-ai/sdk` and Anthropic's server-side `web_search_20250305` / `web_search_20260209` tools. Per-research cost is ~$1.30 (tokens + native web search), and the architecture cannot accept a non-Anthropic key.

We want two outcomes:

1. **Provider portability.** A user with a Moonshot Kimi key but no Anthropic key should be able to run full research. Kimi K2.6 exposes an Anthropic-compatible endpoint, making this swap unusually clean.
2. **Cheaper, portable web search.** Replace Anthropic's native `web_search` with EXA, which is free for the first 1,000 requests/month and ~$7/1k thereafter. Bonus: EXA works identically across providers, so the same agentic loop runs on either Anthropic or Kimi.

Other OpenAI-compatible providers (DeepSeek, Minimax, OpenAI) are explicitly **out of scope** for this slice. Adding them later is a smaller delta on top of this work.

## Goals

- Add a Kimi adapter that uses `@anthropic-ai/sdk` with a baseURL override.
- Add EXA as a custom function tool that participates in the same tool-use loop today's code already drives.
- Settings page accepts three keys (Anthropic, Kimi, EXA). Routing is automatic from key presence — no provider radio.
- All 7 existing sections work on every supported routing combo without changing their prompts or schemas.
- Existing Anthropic-only users see no behavior change.

## Non-Goals

- OpenAI, DeepSeek, Minimax, or any other OpenAI-compat provider.
- Per-section provider override (YAGNI).
- Pre-fetched search results (we keep the agentic loop intact).
- Streaming tool-call output to the client (sections stream now; tool turns stay server-internal).
- Replacing Anthropic citations extraction or HEAD/GET validation — those are provider-neutral and stay untouched.

## Architecture

```
src/lib/llm/
  index.ts                  public surface: runResearchCall(args)
  provider.ts               selectProvider(keys) → { provider, searchBackend, errors }
  types.ts                  ProviderId, SearchBackend, ModelTier, RunArgs
  adapters/
    anthropic.ts            current logic moved here, near-zero behavior change
    kimi.ts                 Anthropic SDK with baseURL override; drops code_execution
  tools/
    exa-search.ts           custom function tool definition + handler
    exa-client.ts           thin fetch wrapper over POST https://api.exa.ai/search
```

`src/lib/anthropic.ts` becomes a one-line re-export from `llm/index.ts` for one release, then is deleted in a follow-up commit.

`src/lib/disambiguate.ts` and `src/app/api/research/route.ts` stop importing `runResearchCall` from `lib/anthropic.ts` and instead import from `lib/llm`.

### Routing matrix

`selectProvider({ anthropicKey, kimiKey, exaKey })` returns:

| Anthropic | Kimi | EXA | LLM | Search |
|-----------|------|-----|-----|--------|
| ✓ | ✗ | ✗ | Anthropic | Native `web_search` (today's path, unchanged) |
| ✓ | ✗ | ✓ | Anthropic | EXA function tool |
| ✓ | ✓ | ✗ | Anthropic (Kimi ignored — Kimi requires EXA) | Native `web_search` |
| ✓ | ✓ | ✓ | Anthropic (default; Kimi only used if Anthropic absent) | EXA function tool |
| ✗ | ✓ | ✓ | Kimi | EXA function tool |
| ✗ | ✓ | ✗ | — | **Error: Kimi requires an EXA key** |
| ✗ | ✗ | * | — | **Error: provide an Anthropic or Kimi key** |

Anthropic wins ties because it's the more battle-tested path. A user who explicitly wants Kimi clears their Anthropic key.

### Model tier abstraction

`SectionDefinition.model: string` (currently a literal Anthropic model name) is replaced with:

```ts
type ModelTier = "default" | "reasoning";
interface SectionDefinition<T> {
  // ...
  tier: ModelTier;        // replaces `model`
  // webSearchVersion removed; search backend is provider-derived
}
```

Each adapter resolves tier to its own model:

```ts
// adapters/anthropic.ts
const MODELS: Record<ModelTier, string> = {
  default: "claude-haiku-4-5",
  reasoning: "claude-opus-4-7",
};

// adapters/kimi.ts — single tier on Kimi K2.6
// Exact model ID + baseURL come from Moonshot's Anthropic-compat docs at
// https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart and must be
// verified in Phase 1 of implementation, not assumed from this spec.
const MODELS: Record<ModelTier, string> = {
  default: "kimi-k2-6",     // placeholder — confirm canonical ID
  reasoning: "kimi-k2-6",
};
```

Sections stop carrying provider-specific identifiers. The tool list (web_search version, code_execution, exa_search) is also adapter-internal — sections no longer declare it.

### EXA function tool

```ts
// tools/exa-search.ts
export const EXA_SEARCH_TOOL = {
  type: "custom",
  name: "exa_search",
  description:
    "Search the public web. Returns a list of {title, url, highlights} hits. " +
    "Use for company facts, founder bios, funding rounds, and news. Cite the URL " +
    "you use in your output's `claims`.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      num_results: { type: "integer", default: 5, minimum: 1, maximum: 10 },
    },
    required: ["query"],
  },
};

export async function handleExaSearch(
  input: { query: string; num_results?: number },
  exaKey: string,
): Promise<string> {
  // POST https://api.exa.ai/search
  // body: { query, type: "auto", numResults: 5, contents: { highlights: true } }
  // returns JSON-stringified [{ title, url, highlights[] }, ...]
}
```

### Tool-loop integration

The Anthropic adapter's existing `while (response.stop_reason === "tool_use")` loop already handles `tool_use` blocks server-side via Anthropic's native tools. We extend it to handle `exa_search` blocks ourselves:

```ts
for (const block of response.content) {
  if (block.type === "tool_use" && block.name === "exa_search") {
    const result = await handleExaSearch(block.input, exaKey);
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
  }
}
```

Native `web_search` and `code_execution` blocks remain Anthropic-handled (no client-side intercept) **only when search backend is `native`**. When the search backend is `exa`, the Anthropic adapter omits `web_search_*` from its tool list entirely — only `code_execution` and `exa_search` ship — so the model has no path to invoke a native search.

The Kimi adapter only handles `exa_search` — there are no Anthropic-server tools active, so the entire tool-use loop runs through our handler. This is also why Kimi requires an EXA key: with no native web_search and no EXA, the model has no way to retrieve facts.

### MAX_TURNS budget

Stays at 12. EXA tool calls count against it. Practically, sections call 3–6 EXA queries each, well under the cap.

### Settings UI changes

`/settings` adds two `Input` fields underneath the existing Anthropic field:

```
Anthropic API key  [sk-ant-…………]   [Save]  [Clear]
Kimi API key       [sk-…………………]   [Save]  [Clear]
EXA API key        […………………………]   [Save]  [Clear]
```

A small helper line below the keys reads off `selectProvider()` and shows the current routing: e.g., *"Active: Anthropic + EXA"*, or warns *"Kimi key set but missing EXA — fresh research will fail"*.

Headers sent on `/api/research`:

```
x-anthropic-key: <if set>
x-kimi-key:      <if set>
x-exa-key:       <if set>
```

`localStorage` keys: `anthropic_api_key`, `kimi_api_key`, `exa_api_key` (extending the existing convention).

### Server route changes

`src/app/api/research/route.ts` extracts all three headers, falls back to `process.env.{ANTHROPIC,KIMI,EXA}_API_KEY` per-key, calls `selectProvider`, and either:

- forwards the resolved provider config to `runResearchCall`, or
- returns `400 { error: "missing_search_key", message: "Kimi requires an EXA key for web search" }` when routing fails.

Existing 401 `missing_api_key` becomes a more specific 400 with one of the two error codes above. Client `runResearch()` in `app/company/[slug]/page.tsx` learns the new `missing_search_key` code and surfaces a `needs_key` state pointing at `/settings`.

## Data flow (Kimi + EXA path, the new case)

1. User saves Kimi + EXA keys in `/settings`.
2. ⌘K → search → ENTER. Client posts `/api/research` with `x-kimi-key` and `x-exa-key` headers.
3. Server resolves `provider = "kimi"`, `searchBackend = "exa"`.
4. For each of 7 sections in parallel:
   - Adapter sends prompt to Kimi via `https://api.moonshot.ai/anthropic/v1/messages` using the Anthropic SDK with baseURL override.
   - Kimi responds with `tool_use` block invoking `exa_search`.
   - Server calls EXA `/search`, attaches result as `tool_result`, loops.
   - Loop ends with text JSON output.
5. Citations extracted (provider-neutral), HEAD/GET validated, cached, streamed to client. Same as today.

Citation extraction is unchanged because every section's prompt already instructs the model to emit `claims[]` with `citation_url` / `citation_quote` fields in its JSON output. That post-hoc extraction works identically whether the URLs came from Anthropic's native `web_search`, EXA results, or pure inference — the model is responsible for putting the URL in the JSON regardless of where it found it.

## Error handling

- **Missing keys** → 400 with explicit `error` code and `message`. Client maps to `needs_key` UI.
- **EXA 4xx/5xx** → handler returns a JSON-stringified error blob; the model sees it and either retries with a different query or proceeds with partial info. Tool-loop budget bounds blast radius.
- **Kimi quota / auth errors** → bubble up as `ResearchError("auth_error" | "rate_limit")`, same as Anthropic today.
- **Tier resolution miss** (impossible with current types but defensive) → throw at adapter init, not at runtime.

## Testing

Unit:
- `selectProvider` — exhaustive table from the routing matrix.
- `exa-client` — fetch mock; verifies request shape (`type: "auto"`, `contents.highlights: true`) and response parsing.
- `exa-search` tool handler — given a fake EXA response, returns the expected stringified payload for the model.
- Adapter selection — given `{ provider, searchBackend }`, returns the right adapter instance with the right tool list.

Integration (extending `__tests__/research.test.ts`):
- Existing 3 cases pass unchanged on the Anthropic + native path.
- New: Anthropic + EXA path completes a section through a mocked EXA + Anthropic round-trip.
- New: Kimi + EXA path completes a section through a mocked Kimi (Anthropic-compat) + EXA round-trip.
- New: Kimi alone returns 400 `missing_search_key`.

Manual smoke (after deploy):
- Anthropic-only user (existing) — no behavior change.
- Anthropic + EXA — research a fresh company, watch network: no `web_search_*` tools, only `exa_search` tool calls.
- Kimi + EXA — research a fresh company end-to-end. Verify cost is materially lower than Anthropic baseline.

## Migration plan

Three commits, each independently revertable:

1. **`feat(llm): introduce provider abstraction + Kimi adapter + EXA tool`**
   New files under `src/lib/llm/`. `src/lib/anthropic.ts` becomes a re-export. No section file touches. Existing Anthropic path runs through the new abstraction with same behavior. New tests added.
2. **`refactor(sections): replace model/webSearchVersion with tier`**
   Mechanical edit across 7 section files. Removes the last provider-specific identifier from registry layer.
3. **`feat(settings): Kimi + EXA key inputs + routing status line`**
   `/settings` UI. `route.ts` reads new headers. Client `page.tsx` handles new error codes.

## Cost expectation (per fresh research)

| Path | Anthropic tokens | Search | Total |
|---|---|---|---|
| Anthropic + native (today) | ~$1.00 | ~$0.50 | ~$1.30–1.50 |
| Anthropic + EXA | ~$1.00 | ~$0.05 (50 EXA queries × $7/1k, after 1k free) | **~$1.05** |
| Kimi + EXA | ~$0.30 (K2.6 cheaper tier) | ~$0.05 | **~$0.35** |

EXA's 1,000-request free tier covers roughly 20 fresh researches per month at no cost.

## Risks / open questions

- **Kimi's Anthropic-compat fidelity.** Tool-use loop, stop_reason values, error shapes — all assumed identical to Anthropic's. First implementation step is a smoke test against `https://api.moonshot.ai/anthropic/v1/messages` with a trivial prompt and our exact tool list. If it diverges, fall back to OpenAI-compat adapter (larger scope, deferred).
- **Kimi K2.6 single tier.** We collapse `default` and `reasoning` to the same model. If quality drops on moat, consider Kimi's longer-thinking variant (if exposed) or document the trade.
- **EXA recall on niche companies.** For early-stage / stealth companies, EXA may return fewer or weaker hits than Anthropic's native search. The agentic loop should compensate (model reformulates queries), but watch the dead-citation rate after rollout.
- **State drift across browser tabs.** Three keys in `localStorage` with no sync. If a user opens two tabs and changes a key, behavior diverges. Acceptable; not worth a `storage` event listener for now.

## Out-of-scope follow-ups (don't bundle)

- OpenAI-compat adapter (covers DeepSeek, Minimax, OpenAI).
- Per-section provider override.
- Server-side rate limit on `/api/research`.
- Pre-warming top-N companies into the cache.
