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

- [ ] **A1 — search abstraction.** Owns `src/lib/search/**` (new files only).
      Define `SearchProvider`; port EXA behind it preserving cache, budget cap,
      `with-exa-retry`, `source-fallback` verbatim. Add Firecrawl + Tavily impls. Unit tests.
- [ ] **A2 — BYOK + settings.** Owns `src/lib/api-keys.ts`, `src/app/(home)/settings/page.tsx`.
      `KEY_NAMES` → `openrouter_api_key`, `exa_api_key`, `firecrawl_api_key`, `tavily_api_key`.
      Drop anthropic/kimi + purge stale localStorage entries. Update settings UI. Unit tests.
- [ ] **A3 — review gates.** Owns `.github/**` + review-gate docs. CodeRabbit config
      scoped to PRs targeting `main` only. No gate on `dev`.
- [ ] **A4 — eval scaffold.** Owns `evals/**`. Evalite setup, ~20-company golden set
      (10 early-stage / 10 enterprise), scorers: schema-pass, citation fill-rate,
      dead-link rate, domain adherence. Gated npm script, not CI.

## Phase B — sequential, alone, after A merges to dev

- [ ] **B1 — provider core.** Owns `src/lib/llm/**` + `src/app/api/research/route.ts`.
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

- [ ] Full suite green (185+ tests).
- [ ] One **live** research run against a real company with a real OpenRouter key,
      end to end, all 7 sections populated with resolved citations. Offline tests are not proof.
- [ ] Measured cost of that run recorded and compared against the ~$1.00 baseline.
- [ ] All worktrees merged to `dev`, worktrees removed, spawned agents closed (`herd cleanup`).
- [ ] `/simplify` + `/security-review` run, then PR `dev` → `main`.
