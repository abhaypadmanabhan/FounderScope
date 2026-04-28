# Founderscope — Session Handoff

> **Repo placement:** `SESSION_HANDOFF.md` at repo root. Read this first in the next session before any code changes.

## What this product is

Open-source company research tool. Type a company name → get a structured founder's-eye report in 7 sections (snapshot, moat, founders, tech stack, funding, traction, market) with cited sources. Hero feature is moat analysis with a 4-axis "AI-native replicability score." Stack: Next.js 14 + TypeScript + shadcn/ui + Supabase + Anthropic SDK with web search.

## Where we are right now

**Phase 1 (scaffold):** Done. Section registry pattern, 7 stub sections, Supabase wired, sidebar shell.

**Phase 2 (research engine):** Done and working end-to-end via curl. Patches landed:
- Per-section model + per-section web_search tool version on `SectionDefinition`
- Tool-use loop with `MAX_TURNS = 12`
- Diagnostic logging on schema_validation and model_error
- Strict-with-trust-layer citation validation (resolved / gated / dead)
- Schema-in-prompt with one-shot examples (huge fix — previously Haiku invented its own JSON shapes)
- Name disambiguation step before parallel sections
- Server-side `ANTHROPIC_API_KEY` env fallback (header still wins if present)

**Last live run on Anthropic:** All 7 sections completed cleanly via curl. Six rows visible in Supabase screenshot mid-stream; user says SQL returned empty for moat after — needs verification at start of next session.

**Phase 3 (frontend):** Not started.

## Models and costs

- Moat: `claude-opus-4-7` + `web_search_20260209` (with dynamic filtering beta)
- Other 6 sections: `claude-haiku-4-5` + `web_search_20250305`
- Disambiguation: `claude-haiku-4-5` + `web_search_20250305`

Actual cost per fresh research is **~$1.00**, not the ~$0.34 originally estimated. Web search billing (~$0.30 per company at ~30 searches) was the missed line item. User has spent $3.85 across debugging runs with no UI output yet.

## Critical blocker — fix this first in next session

**The browser page does NOT trigger `/api/research`.** Every time the user has visited `/company/{slug}` in a browser, the server log shows only `GET /company/{slug} 200` and nothing else — no cache GET, no research POST. Manual `curl` against `/api/research` works perfectly and produces all 7 sections, so the backend is verified. The bug is purely in `src/app/company/[slug]/page.tsx`.

**Suspected causes** (in order of likelihood):
1. **Missing `"use client"` directive at top of file** — without it, useEffect doesn't run. Most likely cause.
2. **Early return in the mount effect** — possibly the localStorage gate that was supposed to be removed in `PATCH_PAGE_TRIGGER.md`/`PATCH_PAGE_EFFECT.md`.
3. **Async error in the effect being silently swallowed** — needs try/catch wrapping with `console.error`.

`PATCH_PAGE_EFFECT.md` was written to fix this but its completion summary was never confirmed. The next session must verify that patch's changes are actually in the file, or apply them fresh.

## Cost-reduction priorities for next session

User explicitly asked to cut API costs. In priority order:

1. **Don't research anything until the page renders.** Every research run that doesn't end with a visible UI is wasted money. Fix the page first; only then run another research call. The Anthropic record already exists in Supabase as a cached row — phase 3 dev should be done against that cached data, not fresh runs.

2. **Add a dev-mode mock orchestrator.** When `process.env.MOCK_RESEARCH=true`, `/api/research` returns canned JSON for a known slug from `__fixtures__/anthropic.json` instead of calling Anthropic. Frontend developers can iterate on UI for free. Critical for phase 3.

3. **Reduce moat token cost.** `max_tokens: 16384` for Opus is overkill — moat outputs in our test runs were well under 5000 tokens. Lower to 8192. Saves ~50% on the moat output cost (output is the expensive side at $75/MTok for Opus). Ballpark: takes per-research from ~$1.00 to ~$0.85.

4. **Lower web_search `max_uses`.** Currently 8 per section × 7 sections = up to 56 searches per company. Most sections used 4–6. Drop to `max_uses: 5` for non-moat sections, keep moat at 8. Reduces web search billing from ~$0.30 to ~$0.20.

5. **Cache disambiguation.** Currently runs every fresh research. Add a `disambiguations` table keyed on the user input string → canonical slug. Saves ~$0.03 + 5 seconds on repeat searches of the same name.

6. **Don't retry sections aggressively.** Current orchestrator retries once on dead-citation rejection. With the GATED_DOMAINS layer working, this almost never fires legitimately. Consider removing the retry or only retrying when >50% dead (currently >30%).

7. **Add publisher domains to GATED_DOMAINS.** `anthropic.com/news`, `cnbc.com`, `techcrunch.com` are getting marked "dead" by the validator (likely 403 to non-browser UA). Add to gated list to reduce false-positive section rejections. This isn't direct cost reduction but prevents costly retries.

## Phase 3 goals when we get there

Frontend wiring per `DESIGN_PROMPT.md`. Replace `<pre>JSON</pre>` with real renderers:
- Snapshot: header card with logo (Clearbit), badge row, lead paragraph
- Moat (HERO): giant serif replicability score, radar of 4 sub-axes, three opinionated callout blocks
- Founders: card grid → side sheet with full bio
- Tech stack: two side-by-side stack grids + cost-breakdown stacked bar
- Funding: timeline chart with annotated rounds
- Traction: toggle group, line charts, "Estimated/Confirmed" badges
- Market: TAM/SAM/SOM concentric rings, competitor logo grid

Plus: search combobox (typeahead), settings page, sidebar populated from recent searches, citation hover popovers, refresh button.

**Pre-phase-3 taste check still owed.** The hero moat-section UI design (giant score, radar, opinionated callouts) is riding on the moat output being sharp and opinionated. Read the moat JSON for Anthropic before phase 3 commits to that design. If it reads like Wikipedia, the moat prompt needs hardening first.

## Open files / patches in flight

All patches are in repo root as `PATCH_*.md`:
- `PATCH_MODEL_SWAP.md` — Done
- `PATCH_DIAGNOSE_FAILURES.md` — Done
- `PATCH_SERVER_KEY.md` — Done (folded into `PATCH_PAGE_TRIGGER.md`)
- `PATCH_PAGE_TRIGGER.md` — Partially done; page-effect part may be incomplete
- `PATCH_PAGE_EFFECT.md` — Status unconfirmed, likely the actual fix needed
- `PATCH_SCHEMA_AND_DISAMBIG.md` — Done

## What's verified working

- Supabase schema, RLS bypass with service role key, all 3 tables populated
- `/api/research` POST → SSE stream → 7 sections complete in ~50–90 seconds
- Schema-in-prompt + one-shot examples → zero schema_validation failures on Anthropic test run
- Disambiguation runs first, passes canonical identity to all sections
- Citation validation classifies resolved / gated / dead correctly (with some false-positive deads on publisher domains)
- Cache hit on `/api/companies/{slug}` returns cached report

## What's NOT verified

- Browser page renders any of this. **This is the next-session blocker.**
- Moat row exists in DB (user reports "SQL returned empty" — needs re-check, possibly mid-stream timing artifact)
- Moat output quality (taste check never performed)

## Suggested first actions in next session

1. Open `src/app/company/[slug]/page.tsx`. Read it. Verify `"use client"` is at the top. Check the mount effect for early returns or unhandled errors. Fix.
2. Hard refresh browser, visit `/company/anthropic`. Should hit cached data instantly with no Anthropic calls. **No new spend should be required.**
3. Add the dev-mode mock orchestrator (priority 2 above) before any further research runs.
4. Then taste-check moat from cache, then phase 3.

## Costs already incurred

~$3.85 total over phase 2 debugging. Anthropic data cached in Supabase represents the most expensive row — protect it (don't refresh, don't delete the company). It's the test fixture for phase 3.