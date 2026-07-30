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

## Merged to main

PR #1 merged as `c9621f3` on 2026-07-30. Phases A and B complete.
Both automated reviewers (CodeRabbit, Macroscope) **never ran** on that PR —
CodeRabbit was rate limited, Macroscope was out of credits. The review it did
get was adversarial cross-review per phase, `/simplify`, `/security-review`,
and a manual code-review pass whose 2 HIGH + 2 MEDIUM findings were applied.

## Patch 2026-07-30 — C1 grounding + eval harness (4 agents, run `20260730-0844-b0`)

Brief: `tasks/patch-bibles/2026-07-30.md`. All four merged to `dev`.
299 tests / 36 files green, `tsc --noEmit` clean.

- [x] **C1 grounding.** `src/lib/search/domains.ts` supplies per-section
      `includeDomains`, threaded through `RunArgs` into the `web_search` tool so
      the allowlist reaches the provider request. Maturity is inferred inside the
      existing disambiguation call, so grounding costs no extra request.
      Bias-not-filter is enforced in `sourceFallback`: a thin grounded result
      retries on the OPEN web rather than swapping in `FALLBACK_DOMAINS`.
- [x] **Eval harness runs.** Offline by default with no keys and no network,
      live only behind `FOUNDER_SCOPE_EVAL_LIVE=true`, capped by
      `FOUNDER_SCOPE_EVAL_LIMIT`.
- [x] **First live eval run, ever.** 2 companies, 197s, aggregate 80% —
      Resend 82% on 3 graded facts, Lovable 78% on 1. ~$0.28 estimated.
- [x] Search-layer hardening: typed `SearchHttpError`, null-tolerant
      Firecrawl/Tavily parsing, policy-aware logo path.
- [ ] **Full 20-company live baseline** — still unmeasured. Needs a fresh
      go-ahead (~$2.80). Only a live run says anything about product quality;
      an offline run replays one fixture for all 20 rows and grades Anthropic's
      facts against Shopify's ground truth.
- [ ] **Click through `/settings` once signed in.** It has never been opened in
      a browser. The markup was proven by server-rendering the component, but
      the hydrated behaviours — load-time `purgeRemovedKeys`, save/clear toasts,
      the readiness line — only run in `useEffect`/handlers. The Save button's
      disabled condition changed after review (now gated on `hydrated`).
      Blocked locally: `.env.local` has no `NEXT_PUBLIC_SUPABASE_URL` /
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so sign-in cannot work. Both exist in
      Vercel under Preview/Production — note that a default `vercel env pull`
      targets Development and returns neither.

### What the eval work exposed

- **The harness was never runnable, not merely unwired.** evalite 0.17+ needs
  `@vitest/runner ^4`; the repo pins vitest 2.1.9. `npm run eval` printed its
  banner and exited 1 with zero rows. Pinned evalite to 0.12.0, the newest
  release on `@vitest/runner ^2.1.8`. **Upgrading vitest 2→4 is now its own
  task** — it moves the gate all 299 tests run through, and 0.12.0 also has no
  `evalite/config` entry, so config lives in `vitest.config.ts` instead.
- **Evalite cannot represent an unmeasured score.** Its types say "null scores
  will be reported as 0" and its storage does `score.score ?? 0`, in every
  version. So a company with no ground truth renders identically to one the
  product got wrong. Mitigated with a `graded` column; the authoritative number
  is `aggregateFactualAccuracy`, which excludes nulls.
- **LLM-curated ground truth needs a machine check.** Curation reported auditing
  every fact against its cited URL. `scripts/verify-ground-truth.mjs` fetches
  each source and found **21 of 49 facts unsupported by the page cited**, plus
  two wrong outright: Shopify's exchange (NYSE, where SEC's own mapping says
  Nasdaq) and Stripe's Series I as $650M where the page says "more than $6.5
  billion" — a 10x error the ±10% tolerance would have scored as a product
  failure on every run. Rebuilt to 28 facts, all passing. Run that script after
  any curation edit.
- **A plausible-sounding fix can cost money.** The first logo implementation
  searched `"<name> official site logo"` restricted to the company's own domain,
  then derived a favicon from the matching hostname — one paid search, usually
  two after the thin-result fallback, to recover an argument it was handed, while
  discarding EXA's real logo image for everyone. EXA now keeps its rich path;
  every other provider derives the favicon locally for free.

## Known gaps, deliberately deferred

Each was found by review, judged, and left. None is a correctness bug in the
merged path; all are recorded so the next person does not rediscover them.

- `RunArgs.cacheKey` is inert — nothing reads it. It carried Anthropic prompt
  caching, which died with the adapter. Either delete it (7 section files + 2
  tests) or map it onto OpenRouter cache-control.
- Search budget is debited **before** the cache read, so a cache hit still costs
  a search slot. Identical to the pre-migration adapter; changing it is a
  product decision, not a migration one.
- `exa_usage` still reports zero searches for a section that fails outright;
  the counters are not attached to the thrown error. The retry-accumulation
  half of this was fixed.
- `evals/domains.ts` still duplicates `src/lib/search/domains.ts`. **The two are
  no longer interchangeable and must not be naively merged:** the product list
  holds EXA `includeDomains` filter values (hostname, hostname/path, or
  `*.hostname`), while the eval list holds substring patterns for URL scoring
  (`/investors`, `ir.`). Unifying means deriving one from the other, not
  deleting either.
- `fs:<user-id>:` key parsing assumes a colon-free user id (true for Supabase
  UUIDs today).
- Tavily and Firecrawl may not honour `hostname/path` allowlist entries even
  though EXA documents them. If they do not, path-scoped grounding silently
  degrades to no filter for those providers. Unverified against live APIs.
- Vitest is pinned at 2.1.9, which caps evalite at 0.12.0. Upgrading to vitest 4
  would unlock current evalite but moves the gate all 299 tests run through.

### Closed by the 2026-07-30 patch

- ~~Source-fallback issues a second live paid search that is never debited~~ —
  now debited, with a test proving two live searches spend two slots and that an
  exhausted budget degrades to the primary results instead of throwing.
- ~~`exaCompanyLogo` bypasses `withSearchPolicy`; Firecrawl/Tavily users get no
  logo~~ — EXA's rich path is debited and counted; other providers derive the
  favicon locally at no cost.
- ~~Firecrawl/Tavily response parsing is not null-tolerant~~ — both tolerate
  null and missing result fields now.
- ~~`src/lib/search/http.ts` encodes provider + status into an error message~~ —
  typed `SearchHttpError` carries them as fields.
- ~~Host allowlist matching can false-positive on `foo.investors.com`~~ — no
  longer reachable from the product path. The bare-prefix entries that caused it
  (`investors.`, `ir.`, `/investor`) are not legal EXA `includeDomains` values
  and were removed; investor-relations pages are now reached via the company's
  own domain plus `*.domain`. The pattern still exists in `evals/domains.ts`,
  where substring matching is the correct behaviour.
- ~~Firecrawl `includeDomains`/`excludeDomains` unverified~~ — checked against
  the official v2 docs and left unchanged.
