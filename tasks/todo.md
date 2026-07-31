# OpenRouter Migration — Checkpoint

**Spec:** `docs/superpowers/specs/2026-07-28-openrouter-migration-design.md` (approved 2026-07-28)
**Integration branch:** `dev`. Never commit product code directly to `main`.
**Baseline:** 185 tests / 31 files green at `f9ceac0`.

## Decisions locked — do not relitigate

- Framework: **Vercel AI SDK v6**. Mastra and LangGraph.js considered and rejected (see spec D1).
- Models: `default` → `google/gemini-3.1-flash-lite`, `reasoning` → `deepseek/deepseek-v4-pro`.
  Hardcoded for users; `FS_MODEL_DEFAULT` / `FS_MODEL_REASONING` override for eval sweeps only.
- BYOK: OpenRouter key only. Anthropic + Kimi keys removed entirely. Search key required.
- Search: `SearchProvider` interface, EXA default, Firecrawl/Tavily optional swap-ins.
- Evals: Evalite + ~20-company golden set. Never in CI — costs real money.
- Review gates: CodeRabbit on PR→`main` only. `/simplify` + `/security-review` before that PR.

## Phase A — parallel, worktrees, no file overlap

- [x] **A1 — search abstraction.** Owns `src/lib/search/**` (new files only).
      Define `SearchProvider`; port EXA behind it preserving cache, budget cap,
      `with-exa-retry`, `source-fallback` verbatim. Add Firecrawl + Tavily impls. Unit tests.
- [x] **A2 — BYOK + settings.** Owns `src/lib/api-keys.ts`, `src/app/(home)/settings/page.tsx`.
      `KEY_NAMES` → `openrouter_api_key`, `exa_api_key`, `firecrawl_api_key`, `tavily_api_key`.
      Drop anthropic/kimi + purge stale localStorage entries. Update settings UI. Unit tests.
- [x] **A3 — review gates.** Owns `.github/**` + review-gate docs. CodeRabbit config
      scoped to PRs targeting `main` only. No gate on `dev`.
- [x] **A4 — eval scaffold.** Owns `evals/**`. Evalite setup, ~20-company golden set
      (10 early-stage / 10 enterprise), scorers: schema-pass, citation fill-rate,
      dead-link rate, domain adherence. Gated npm script, not CI.

## Phase B — sequential, alone, after A merges to dev

- [x] **B1 — provider core.** Owns `src/lib/llm/**` + `src/app/api/research/route.ts`.
      Delete `adapters/anthropic.ts`, `adapters/kimi.ts`, `provider.ts`.
      Add `openrouter.ts` + `models.ts`. Rewire `runResearchCall` onto AI SDK.
      **Verify the v6 structured-output-with-tools API via context7 first** — `generateObject`
      has no tool support; expect `generateText` + `experimental_output: Output.object({schema})`.
      Do NOT port the Kimi `response_format` workaround (commit `f9ceac0`) — obsolete.
      Classify each failing test as adapter-internal (delete) or product-behavior (must pass).

## Phase C — after B

- [ ] **C1 — grounding + first eval run.** Owns `src/lib/search/domains.ts` + section prompts.
      Per-section `includeDomains`, early-stage vs enterprise split. Allowlists bias, never
      hard-filter — open-search fallback stays. Then run the eval suite and record the baseline.

## Definition of done

- [x] Full suite green — 250 tests / 31 files on `dev`, `tsc --noEmit` clean.
- [x] One **live** research run against a real company (Linear) with a real OpenRouter
      key — **7/7 sections populated**, 33 claims / 29 cited (fill rate 0.879),
      29 citations / 27 resolved (93%), 15 real EXA searches.
- [x] Measured cost: **0.0852 credits (~$0.085)** on a warm search cache;
      **0.1417 (~$0.14)** on the colder preceding run. Defensible range
      **~$0.085–0.14** vs the ~$1.00 baseline — a **7–12x reduction**. Quote $0.14.
- [x] All worktrees merged to `dev`, worktrees removed, spawned agents closed (`herd cleanup`).
- [ ] `/simplify` + `/security-review` run, then PR `dev` → `main`.

## Live-run defect log — found only with a real key

Every one of these passed the offline suite. Recorded so the next migration
looks for them deliberately.

1. **Tool name mismatch.** Prompts say `web_search`; the loop registered
   `exa_search`. All 8 calls were told to use a tool that did not exist.
2. **Timeout scope inversion.** `TIMEOUT_MS = 60_000` was carried over verbatim,
   but the old adapter applied it *per turn* across <=12 turns while the new one
   wrapped the whole tool loop. Same constant, ~12x less headroom.
3. **Missing `SearchBudget`.** `withSearchPolicy` required a budget the tool loop
   never passed, so every search died on `TypeError: ...reading 'used'` before
   reaching the network. This was reviewer SHOULD-FIX #9 ("budget enforcement is
   opt-in") maturing into a hard failure once the wrapper became mandatory.
4. **Invalid `EXA_API_KEY`.** 401 on every search. Masked as "budget exhausted"
   because only the *last* search error was reported, not the first.
5. **`Output.object` forces a response format on tool steps.** The SDK attaches
   `responseFormat: {type:"json"}` to every step, so the model could not emit a
   tool call and complied immediately with an empty schema-valid object. This is
   why sections looked "successful" with zero claims — and why `moat` appeared to
   work while never actually searching. `usage.calls = 0` was the truth all along.
6. **Flat per-step timeout across tiers.** A reasoning model's thinking phase
   legitimately exceeds 60s; a flash model's does not.

## Still open (non-blocking)

- `evals/domains.ts` duplicates the planned `src/lib/search/domains.ts` (C1).
- Firecrawl/Tavily are not null-tolerant the way EXA's parser now is.
- `fs:<user-id>:` key parsing assumes a colon-free user id (true for Supabase UUIDs).
- Host allowlist matching can false-positive on `foo.investors.com`.
- **Phase C1 not started** — per-section `includeDomains` grounding + first eval run.
- Section search budgets are still per model call, so nothing caps EXA spend
  across a whole request: six default-tier sections at 8 plus moat at the
  reasoning tier's 10, so up to 58 searches, plus the 1 the `logo` tier now
  allows. A request-scoped pool that per-call budgets draw from is the real fix;
  the `logo` tier is the first budget shaped that way.
