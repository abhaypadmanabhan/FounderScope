# Founderscope — Session Handoff

> **Read this first** before any code changes. Repo placement: root.

## What this product is

Open-source company research tool for founders. Type a company name → get a structured 7-section report (snapshot, moat, founders, tech stack, funding, traction, market) with cited sources. Hero feature is moat analysis with a 4-axis "AI-native replicability score." Stack: Next.js 14 + TypeScript + shadcn/ui (base-nova) + Supabase + Anthropic SDK with web search + Recharts.

## Where we are right now

**Initial commit landed:** `383de1d` — scaffold + Phase 1 (section registry, Supabase, sidebar shell) + Phase 2 (research engine end-to-end with disambiguation, schema-in-prompt, citation validation) + founder-intel reframe (chunks 1–6 + cache-route alignment) all in one.

- 10 tests passing (`npm test`)
- Type-check clean (`npx tsc --noEmit`)
- Working tree clean
- Cache route, SSE fresh path, SSE cache-hit path, and mock orchestrator all emit the identical `citation_status: { resolved, gated, dead, total }` shape on every section
- Mock orchestrator works (`MOCK_RESEARCH=true`) — phase 3 frontend can be built against it for $0

**Anthropic cached row in Supabase:** 6 of 7 sections present (snapshot, founders, tech_stack, funding, traction, market). Moat row absent — pre-existing gap, will backfill naturally on first fresh research run.

**Phase 3 (frontend renderers):** not started.

## Posture (new — must read before tightening citation handling)

Founder-intel orientation, not journalist orientation. Users research everything from public giants to 6-month-old YC startups. For early-stage targets, citations are signal, not a gate.

Five load-bearing rules:

1. **Citations annotate, never gate.** The orchestrator validates URLs (resolved / gated / dead) for UI display but never retries on dead-citation rates. The retry branch was deleted in the reframe — don't reintroduce it.
2. **Claims may be inferred.** Set `citation_url=null + inferred=true` when synthesizing from observable facts without a citable source. Inventing URLs is forbidden; null + inferred is honest.
3. **Founders is the only section that fails loud on empty findings.** `schema.min(1)` on `founders[]` forces a `section_failed` when no founders are identifiable — the user needs to know they got the wrong company or it's too stealth to research. Every other section accepts empty arrays as a finding.
4. **Moat carries per-axis confidence.** `replicability.confidence: { data, network, distribution, regulatory }` is an enum (high/medium/low) orthogonal to score. A confident "no regulatory moat" is score 1–2, confidence: "high".
5. `market.competitors` and `compounding_moments` accept `min(0)` — empty arrays are legitimate findings for early-stage targets.

**Canonical version of this lives in `src/lib/sections/shared.ts` posture comment.** If this handoff doc and the posture comment ever drift, the comment wins.

## What's verified working

- Browser page renders cached data (chunk 1 fix from prior session — page-trigger debugging superseded by mock approach)
- Mock orchestrator end-to-end with the new schema (10/10 tests, 7/7 SSE events emit citation_status)
- Cache route emits citation_status on each section (verified live: 6/6 DB sections for Anthropic)
- SSE no-retry behavior locked in by test (`__tests__/research.test.ts` asserts `moatPrompts.length === 1`)
- Linear snapshot output proved the founder-intel snapshot prompt works on a non-Anthropic company
- Citation validation classifies resolved / gated / dead correctly (with some false-positive deads on publisher domains — see deferred item below)

## What's NOT verified

- **Moat output quality on a fresh early-stage company (Wayline-class).** The reframe was designed for this case but only tested against the Anthropic fixture. First fresh research run after phase 3 frontend lands is the real test.
- **Moat row in DB for Anthropic.** Will backfill naturally on first fresh research run; not a blocker.

## Models and costs

- Moat: `claude-opus-4-7` + `web_search_20260209` (with dynamic filtering beta)
- Other 6 sections: `claude-haiku-4-5` + `web_search_20250305`
- Disambiguation: `claude-haiku-4-5` + `web_search_20250305`

Roughly **~$5 spent total** across the project, including this session's Linear verification run (~$0.40–0.60). A fresh research run is ~$1.00 (web search ~$0.30 of that). Cost reductions deferred — they don't bite until fresh API calls resume, which is post-frontend.

## Suggested first actions for next session

1. **Start phase 3 frontend against `MOCK_RESEARCH=true`.** Read `DESIGN_PROMPT.md`. Free iteration, no API spend.
2. **Build snapshot renderer first.** Simplest, well-shaped data, validates the rendering layer before tackling moat hero.
3. **Moat hero last.** It's the design-heaviest section and the data is already tested as ship-ready against the Anthropic fixture.
4. **Only run a fresh research call** when the renderers are good enough that you'd want to see real output in them. Probably on a fresh early-stage YC company (Wayline or similar) to actually test the founder-intel posture in the wild — that's the real validation gate for the reframe.

## Open items deferred (not blockers)

- **Cost reduction #3:** Moat `max_tokens` 16384 → 8192 (~$0.15/research savings)
- **Cost reduction #4:** web_search `max_uses` 8 → 5 for non-moat sections (~$0.10/research savings)
- **Cost reduction #5:** Cache disambiguation table (~$0.03 + 5s on repeat searches)
- **Cost reduction #7:** Add `anthropic.com/news`, `cnbc.com`, `techcrunch.com` to `GATED_DOMAINS` (prevents false-positive dead citations on publisher domains)
- **`funding_summary` field doesn't exist.** Bootstrapped narrative currently routes through `milestones[]` with `kind: "other"`. Add a dedicated field if narrative slot is wanted.
- **`PATCH_*.md` files in repo root** are now historical. Most are done; the page-trigger ones got superseded by the mock approach. Decide whether to delete them or move to a `/history` folder.

## Phase 3 goals (when we get there)

Frontend wiring per `DESIGN_PROMPT.md`. Replace `<pre>JSON</pre>` with real renderers:

- Snapshot: header card with logo (Clearbit), badge row, lead paragraph
- Moat (HERO): giant serif replicability score, radar of 4 sub-axes with per-axis confidence overlay, three opinionated callout blocks
- Founders: card grid → side sheet with full bio
- Tech stack: two side-by-side stack grids + cost-breakdown stacked bar
- Funding: timeline chart with annotated rounds
- Traction: toggle group, line charts, "Estimated/Confirmed" badges
- Market: TAM/SAM/SOM concentric rings, competitor logo grid

Plus: search combobox (typeahead), settings page, sidebar populated from recent searches, citation hover popovers (use the `citation_status` counts), refresh button.

## Pre-Phase-3 taste check (completed)

The moat output was assessed against the Anthropic cached row before the reframe. Verdict: ship-ready for the hero UI design (giant score, radar, opinionated callouts). The assessment surfaced three optional tightenings (regulatory specificity, compounding moment citations, attack_vector structural-weakness rule) — all folded into the moat prompt during chunk 3 of the reframe. Phase 3 hero design is unblocked on content quality grounds.

## Files of note

- `src/lib/sections/shared.ts` — canonical posture comment, claim schema, prompt builder
- `src/lib/sections/moat.ts` — per-axis confidence schema, moat prompt + one-shot example
- `src/lib/sections/founders.ts` — fail-loud policy
- `src/lib/citations.ts` — `summarizeCitationStatuses` (fresh path) + `countCitationStatuses` (cache/mock paths)
- `src/app/api/research/route.ts` — SSE orchestrator, no retry branch
- `src/app/api/companies/[slug]/route.ts` — GET cache route, emits citation_status
- `src/lib/mock-research.ts` — mock orchestrator, mirrors real SSE shape
- `__fixtures__/research-anthropic.json` — Anthropic test fixture (used by mock)
- `__tests__/research.test.ts` — orchestrator tests, locks no-retry behavior
- `__tests__/mock-research.test.ts` — mock SSE tests
