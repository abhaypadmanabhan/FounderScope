# OpenRouter Migration + Agentic Framework Adoption

**Date:** 2026-07-28
**Branch:** `dev` (integration), feature work in worktrees
**Status:** Approved design, not yet implemented

## Problem

FounderScope has no agentic framework. The LLM layer is hand-rolled across two
provider adapters (`adapters/anthropic.ts`, `adapters/kimi.ts`) that each
re-implement the same concerns: a `while(true)` tool loop, `finish_reason` /
`stop_reason` dispatch, EXA budget counting, retry, and JSON salvage. The
duplication is the maintenance cost — roughly half the 185-test suite exists to
defend that hand-written surface rather than product behavior.

Three consequences follow:

1. Adding a provider means writing a third copy of the loop.
2. Adding a search backend means editing every adapter.
3. There is no telemetry or eval surface, so model changes cannot be evaluated.

## Goals

- Route all inference through OpenRouter with a single BYOK key.
- Replace both hand-rolled tool loops with the Vercel AI SDK v6.
- Make the web-search backend swappable behind one interface.
- Cut per-research cost from ~$1.00 to ~$0.14 without losing citation quality.
- Establish a free, local eval harness that can benchmark model swaps.

## Non-goals

- User-facing model selection. The model map is hardcoded; only the eval harness
  overrides it.
- Migrating to Mastra or LangGraph. Revisit only if agent state outgrows
  stateless fan-out.
- Paid observability vendors. Langfuse self-hosted is the ceiling.

## Current state

Eight LLM calls per research: one disambiguation pass, then seven sections
fanned out with `Promise.allSettled` and streamed over SSE.

| # | Call | Tier | Anthropic model | Kimi model | EXA budget |
|---|---|---|---|---|---|
| 0 | `disambiguate` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |
| 1 | `snapshot` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |
| 2 | `moat` | reasoning | `claude-opus-4-7` | `kimi-k2.6` +thinking | 10 |
| 3 | `founders` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |
| 4 | `tech_stack` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |
| 5 | `funding` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |
| 6 | `traction` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |
| 7 | `market` | default | `claude-haiku-4-5` | `kimi-k2.5` | 8 |

Measured cost basis: seven default calls at ~$0.055 each plus `moat` on Opus at
~$0.60 reproduces the ~$1.00/research figure recorded in `CLAUDE.md`.

## Decisions

### D1 — Framework: Vercel AI SDK v6

Apache-2.0, TypeScript-native, strongest hiring signal among TS/Next startups,
and OpenRouter is a first-class provider. It maps directly onto what this
codebase already does: a tool loop that terminates in a Zod-validated object.

Mastra was the runner-up. Its only unique advantage is bundled eval scorers, and
it is itself built on the AI SDK — so adopting it later is additive, not a
rewrite. LangGraph.js was rejected: a graph state machine is the wrong shape for
an independent fan-out of eight stateless calls, and its JS port lags the Python
original.

### D2 — Model map

| Tier | Model | $/M in | $/M out | Reasoning toggle | Applies to |
|---|---|---|---|---|---|
| `default` | `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | yes | disambiguate + 6 sections |
| `reasoning` | `deepseek/deepseek-v4-pro` | 0.43 | 0.87 | yes | `moat` |

Projected ~$0.14/research, a ~7x reduction. Pricing pulled live from
`https://openrouter.ai/api/v1/models` on 2026-07-28; both models expose `tools`
and togglable reasoning via OpenRouter's `reasoning` parameter.

The map is hardcoded for end users. Only `FS_MODEL_DEFAULT` and
`FS_MODEL_REASONING` env vars override it, so the eval harness can sweep models
and produce comparative benchmarks.

### D3 — BYOK surface

End users paste one OpenRouter key plus one search key. Anthropic and Kimi keys
are removed entirely, including a localStorage cleanup for stale entries.

| Key | Required | Header |
|---|---|---|
| `openrouter_api_key` | yes | `x-openrouter-key` |
| `exa_api_key` | yes (default backend) | `x-search-key` |
| `firecrawl_api_key` | optional | `x-search-key` + `x-search-provider: firecrawl` |
| `tavily_api_key` | optional | `x-search-key` + `x-search-provider: tavily` |

Search is required, not optional. No OpenRouter model in the map has a native
web-search tool, so without a search key a report would be ungrounded.

### D4 — Search provider abstraction

Framework-independent by design — this is an interface, not an AI SDK feature:

```ts
interface SearchProvider {
  readonly id: "exa" | "firecrawl" | "tavily";
  search(query: string, opts: SearchOptions): Promise<SearchResult[]>;
}
```

Existing EXA behavior is preserved wholesale behind the `exa` implementation:
the response cache, the per-tier budget cap, `with-exa-retry`, and
`source-fallback`. Those are product logic, not provider logic, and must not be
rewritten during the move.

### D5 — Grounding via domain allowlists

Vague open-web search is the main quality risk. Each section declares an
`includeDomains` set, split by company maturity:

- **Early stage** — `ycombinator.com/companies`, `crunchbase.com`,
  `producthunt.com`, `wellfound.com`, `sec.gov` (Form D), `github.com`,
  `linkedin.com/company`, `opencorporates.com`
- **Enterprise** — `sec.gov/edgar` (10-K), `annualreports.com`, investor-relations
  hosts, `find-and-update.company-information.service.gov.uk`, `macrotrends.net`
- **Tech stack** — `builtwith.com`, `stackshare.io`, `github.com`, careers pages

Allowlists are a bias, not a hard filter: a section that finds nothing inside its
allowlist falls back to open search rather than returning empty.

### D6 — Evals

Evalite (OSS, Vitest-based, AI SDK native) over promptfoo, because it reuses the
Vitest setup already in the repo instead of standing up a parallel runner.

Golden set of ~20 companies, deliberately split 10 early-stage / 10 enterprise
so regressions in either regime surface separately.

Scorers, all deterministic and free:

| Scorer | Signal |
|---|---|
| schema-pass | Zod validation succeeded |
| citation fill-rate | `cited_claims / total_claims` — already emitted by `route.ts` |
| dead-link rate | already computed by `validateCitations` |
| domain adherence | fraction of citations inside the section allowlist |

Eval runs hit live APIs and cost real money. They are gated behind an explicit
npm script and never run in CI.

Tracing is AI SDK's built-in OpenTelemetry (`experimental_telemetry`), pointed at
a self-hosted Langfuse when one is available. Optional; not a blocker.

### D7 — Review gates

Code review runs on PRs into `main` only, never into `dev` — `dev` is the
integration branch and gating it would stall the fan-out. CodeRabbit handles the
automated pass. The orchestrator runs `/simplify` and `/security-review` before
opening any PR to `main`.

## Implementation notes

`generateObject` does not support tools. The tool-loop-plus-structured-output
path is `generateText` with `tools`, `stopWhen`, and `experimental_output:
Output.object({ schema })`. **The implementing agent must verify the exact v6
surface against current docs (context7) before writing code** — this note is
written from recall, not from a verified read, and the AI SDK's structured-output
API has moved between versions.

Kimi's `response_format` incompatibility (commit `f9ceac0`) becomes moot: the
model is gone and OpenRouter normalizes tool-call transport. Do not port the
workaround.

## Work partition

Partitioned so no two concurrent agents write the same file. Overlap between
parallel agents is what makes fan-out produce garbage.

| Phase | Agent | Owns | Depends on |
|---|---|---|---|
| A | A1 | `src/lib/search/**` (new) | — |
| A | A2 | `src/lib/api-keys.ts`, `src/app/(home)/settings/page.tsx` | — |
| A | A3 | `.github/**`, review-gate docs | — |
| A | A4 | `evals/**` scaffold + golden set | — |
| B | B1 | `src/lib/llm/**` rewrite, `src/app/api/research/route.ts` | A1, A2 |
| C | C1 | section prompts + `domains.ts` wiring, first eval run | B1 |

Phase A runs fully parallel. Phase B is load-bearing — it deletes both adapters
and rewires every call site — so it runs alone, after A merges. Splitting B
across agents would guarantee conflicts in `src/lib/llm/`.

## Testing

- Existing 185 tests are the regression baseline. Tests that assert
  Anthropic/Kimi adapter internals get deleted with those adapters; tests that
  assert product behavior (citations, cache, budget, fallback, disambiguation)
  must keep passing unchanged.
- Each phase-A agent lands its own unit tests before merge.
- Phase B is not complete until the full suite is green and one live research
  run against a real company succeeds end-to-end with a real OpenRouter key.
  Offline tests do not count as proof.

## Risks

| Risk | Mitigation |
|---|---|
| AI SDK v6 structured-output API differs from recall | Verify via context7 before writing; the spec flags this explicitly |
| Cheaper models degrade citation quality | Eval harness measures fill-rate and dead-link rate before/after; roll back the map if either regresses |
| Deleting adapters breaks tests that encode real product behavior | Classify each failing test as adapter-internal or product-behavior before deleting it |
| Domain allowlists starve a section of results | Allowlists bias, never filter — open-search fallback stays |
