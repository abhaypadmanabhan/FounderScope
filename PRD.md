# Founderscope — Product Requirements Document

> An open-source company research tool for founders, by a founder.
>
> **Repo placement:** This file lives at the repository root as `PRD.md`. Claude Code, contributors, and future-you all read this as the source of truth. When you change scope, update this file in the same PR.

---

## 1. One-line pitch

Type a company name or URL. In ~60 seconds get a structured founder's-eye view: what they do, who built it, their moat, their tech stack, how they got funded, what their traction looks like, and whether you could realistically compete. Built so a fellow founder learns something every search.

## 2. Why this exists

Crunchbase tells you funding. LinkedIn tells you headcount. Sacra tells you ARR estimates. BuiltWith tells you the stack. None of them synthesize. The gap is *opinionated synthesis with a builder's lens* — and that's what an LLM with web search does well.

The hero feature is **moat analysis with an AI-native replicability score**: could a technical founder with Claude Code rebuild this in six months? This is the section that earns return visits.

## 3. Users

- **Primary:** technical founders and early-stage builders studying the market.
- **Secondary:** investors, students, journalists, anyone curious about a startup.
- **Distribution:** open source, MIT licensed. Anyone can clone and self-host. A hosted demo runs on Vercel.

## 4. Core user flow

1. User lands on home. Sees a search bar (company name or URL) and a left sidebar listing recently-researched companies (global, sorted by recency).
2. As the user types, a dropdown shows up to 5 fuzzy-matched companies from the global cache, each with a "researched Nd ago" timestamp.
3. **If user clicks a suggestion, or presses Enter on an exact-name match:** instantly route to the cached report at `/company/{slug}`. No API calls, no research run.
4. **If user presses Enter on a non-matching query:** kick off a fresh research run, create a new company entry, route to `/company/{new-slug}` which renders skeleton sections that progressively fill as each section's research completes.
5. On any report page a "Refresh" button (top-right) lets the user force a re-research using their own Anthropic API key. A modal confirms with an estimated cost.
6. The sidebar reflects global state. Clicking a sidebar item routes to that company's cached report.

## 5. Sections (display order)

Sections are ordered by a balance of "fast to compute" first, "hero feature" prominently, and biographical/financial flow after. Order is configurable via the section registry (see §8).

| # | Section | Purpose | Cache TTL |
|---|---------|---------|-----------|
| 1 | Snapshot | What the company does + key tags | 30d |
| 2 | Moat & Replicability | Hero. Defensibility + AI-native rebuild score | 30d |
| 3 | Founders | Who built it, what they bring | 30d |
| 4 | Tech Stack & Build Cost | Stack now vs. at MVP, estimated MVP cost | 14d |
| 5 | Funding Journey | Rounds, investors, timeline | 14d |
| 6 | Traction | ARR estimates, headcount, web traffic, with data-quality badges | 7d |
| 7 | Market & Competition | TAM/SAM/SOM, competitors, pioneer-vs-follower | 14d |

### 5.1 Snapshot

- One-paragraph summary of what the company does.
- Tags: B2B / B2C / B2B2C, industry, stage (Seed / A / B / C / Growth / Public / Unicorn), HQ city, founded year, employee count band.
- Sources: company site, Crunchbase public, Wikipedia, LinkedIn public.
- UX: header card with logo (Clearbit logo API), serif H1 for company name, badge row, lead paragraph with inline citations.

### 5.2 Moat & Replicability *(hero)*

- Plain-language moat description.
- Moat type tags: data, network effects, distribution, brand, regulatory, switching costs, scale economies.
- "How they got it" — 3–5 compounding moments as a short timeline.
- **Replicability score (1–10)** computed from a fixed four-axis rubric:

  | Axis | Weight | What it measures |
  |------|--------|------------------|
  | Data moat | 30% | Is the proprietary data hard to reproduce? |
  | Network effects | 30% | Does each user make the product more valuable for the next? |
  | Distribution / brand | 20% | Is the go-to-market advantage durable? |
  | Regulatory / structural | 20% | Are there license, capital, or compliance barriers? |

  Each axis scored 1 (trivial) to 10 (effectively impossible). Final = weighted average, rounded to one decimal. **Lower score = easier to replicate.** Display the final number as the headline; show the four sub-scores on hover via a small radar chart.

- Three written sub-blocks: *What's actually defensible*, *What looks hard but isn't*, *If you wanted to compete*.
- UX: large serif score, color-graded green→amber→red, methodology link, sub-blocks as quiet callouts. Most vertical real estate of any section.

### 5.3 Founders

- Per founder: photo, name, role, LinkedIn URL, college, prior companies, technical/non-technical badge, one-line "what they bring."
- Click a founder card → shadcn Sheet (right side) with full bio: education path, prior exits, public writing/talks, links.
- Sources: Wikipedia, company About page, Crunchbase public profile, LinkedIn public.
- **Honesty constraint:** never fabricate a photo. If no photo is reliably available, render initials in a circle.

### 5.4 Tech Stack & Build Cost

- **Current stack** by layer: frontend, backend, database, infra/cloud, key vendors (auth, payments, email, analytics, observability, AI). Show as a labeled grid of logo chips.
- **MVP-era stack** (best-guess, marked "estimated"): same layers, what they likely launched with. Pulled from earliest job postings, Wayback Machine, founder interviews, GitHub history.
- **MVP cost estimate** with breakdown:
  - Team: founders + early hires × months × market rate.
  - Infra: hosting, third-party services for the first 6 months.
  - Other: design, legal, incorporation.
  - Total expressed as a range (e.g. "$80k–$140k pre-seed-equivalent build cost").
  - Always labeled "estimated" with a methodology tooltip.
- **Stack evolution:** 2–3 sentence narrative on what changed as they scaled and why (e.g. "moved off Heroku to AWS at ~Series B for cost and control").
- Sources: job postings, BuiltWith, Wappalyzer, StackShare, engineering blog, GitHub orgs, conference talks, Wayback Machine.
- UX: two side-by-side grids ("Now" vs "MVP era"), cost breakdown as a compact stacked bar, narrative below.

### 5.5 Funding Journey

- Timeline of rounds with amount, lead investor, post-money valuation if known.
- Annotations for milestones: first paying customer, first key hire, pivot, major launch.
- UX: horizontal timeline with cumulative-capital line (Tremor / Recharts), dots per round, hover for round detail. Below: investors grouped by round in a quiet table.

### 5.6 Traction

- Best-available signals only:
  - **ARR / revenue estimate** (Sacra, Contrary, news leaks, S-1 if public).
  - **Headcount over time** (LinkedIn proxy via aggregators or Wayback).
  - **Web traffic trend** (Similarweb free tier or skip).
  - **App store rank** (where relevant).
- Each metric tagged "Estimated" or "Confirmed" with a source tooltip.
- Toggle group at top to switch between metrics.
- **Honest empty state:** if a metric has no reliable public data, say so plainly. Do not fabricate.

### 5.7 Market & Competition

- TAM / SAM / SOM rendered as three nested concentric rings (custom SVG, not a chart library — keeps it editorial). Each labeled with source ("industry analyst" / "company-stated" / "our estimate").
- Pioneer-vs-follower verdict in one sentence with reasoning.
- 4–6 competitors as a logo grid, each with a one-line positioning note.

## 6. Citations

Every factual claim renders with a small superscript number in the accent color. Hovering opens a popover with source URL and a 1–2 line excerpt. Clicking opens the source in a new tab. Each report has a numbered Sources section at the bottom.

Implementation contract: every section's prompt requires JSON output with a `claims: [{ text, citation_url, citation_quote }]` shape. The renderer maps claims to numbered citations.

## 7. Architecture

### 7.1 Stack

- Next.js 14 App Router + TypeScript
- shadcn/ui + Tailwind
- Postgres via Supabase (free tier) for shared cache + history
- Anthropic SDK with web search tool
- Recharts (and Tremor wrappers where they help)
- Vercel deploy

### 7.2 Data model

```sql
companies (
  id              uuid pk,
  slug            text unique,
  display_name    text,
  domain          text,
  logo_url        text,
  search_tokens   text[],          -- name + domain + aliases, GIN-indexed
  created_at      timestamptz,
  last_refreshed_at timestamptz,
  refresh_count   int default 0
)

reports (
  id              uuid pk,
  company_id      uuid fk,
  section_key     text,            -- snapshot | moat | founders | tech_stack | funding | traction | market | <future>
  schema_version  int,             -- so we can evolve section schemas without breaking old data
  content_json    jsonb,
  citations_json  jsonb,
  generated_at    timestamptz,
  model_version   text,
  unique (company_id, section_key)
)

search_history (
  id              uuid pk,
  company_id      uuid fk,
  searched_at     timestamptz
)
```

### 7.3 Section registry — extensibility contract

Each section is a self-contained module under `/lib/sections/`. Adding a section means dropping a new file and registering it. No edits to the orchestrator, the cache layer, or the report page.

```ts
// /lib/sections/types.ts
export interface SectionDefinition<T = unknown> {
  key: string;                          // stable id, used as section_key in DB
  title: string;                        // display title
  order: number;                        // display order on report page
  cacheTtlDays: number;                 // per-section cache lifetime
  schemaVersion: number;                // bump when content_json shape changes
  buildPrompt: (company: CompanyInput) => string;  // returns the prompt sent to Claude
  outputSchema: ZodSchema<T>;           // validates Claude's JSON output
  Renderer: React.FC<{ data: T; citations: Citation[] }>;  // section UI
  SkeletonRenderer: React.FC;           // shown while loading
}
```

Sections are registered in `/lib/sections/registry.ts`:

```ts
import { snapshot } from "./snapshot";
import { moat } from "./moat";
import { founders } from "./founders";
import { techStack } from "./tech-stack";
import { funding } from "./funding";
import { traction } from "./traction";
import { market } from "./market";

export const SECTIONS: SectionDefinition[] = [
  snapshot, moat, founders, techStack, funding, traction, market,
].sort((a, b) => a.order - b.order);
```

The orchestrator iterates over `SECTIONS`, fires one Anthropic call per section in parallel, validates each result against its `outputSchema`, persists, and streams the results to the client. The report page does the same iteration to render. To add a new section (say, "Hiring signals"), drop `/lib/sections/hiring.ts` exporting a `SectionDefinition`, add it to `registry.ts`, and ship. The DB needs no migration because `reports.content_json` is jsonb and `section_key` is a text column.

### 7.4 Caching rules

- Per-section TTL as listed in §5.
- "Refresh" on a report page bypasses cache for **all** sections, costs the user tokens, and overwrites the global cache.
- Per-section refresh is out of scope for v1 but the registry supports it (we can expose it later).
- If a section's `schemaVersion` is bumped in code but the cached row has an older version, treat it as expired and re-fetch.

### 7.5 API key handling

- User pastes Anthropic key on `/settings`, stored in `localStorage`.
- Client sends key as a header (`x-anthropic-key`) on research requests.
- Server uses the key only for that request, never persists it.
- If a company is fully cached, no key is required at all — the open-source flywheel.

### 7.6 Research execution

- N parallel server-side calls to Claude (one per section).
- Each prompt includes: company name + domain, the section-specific JSON schema, an instruction to use web search and cite every claim with a real URL.
- Results stream to the client over Server-Sent Events as each section completes.
- Failed sections show a "Couldn't generate this section — try refreshing" state. Other sections render normally.

#### Model strategy

- **Moat** → `claude-opus-4-7` + `web_search_20260209` (dynamic filtering enabled). The hero section earns Opus reasoning quality.
- **All other sections** (snapshot, founders, tech_stack, funding, traction, market) → `claude-haiku-4-5` + `web_search_20250305`. Haiku 4.5 is comparable to Sonnet 4 on structured extraction at roughly 1/3 the cost; pairing it with the legacy web_search tool sidesteps the dynamic-filtering model-support list.
- Per-section configurable via `SectionDefinition.{model, webSearchVersion}`. See `src/lib/sections/types.ts` and `CONTRIBUTING.md` for the pairing rule.

### 7.7 Repository layout

```
/app
  /(home)/page.tsx                    # home with search + sidebar
  /company/[slug]/page.tsx            # report page
  /settings/page.tsx
  /api/research/route.ts              # POST kicks off research, streams SSE
  /api/companies/search/route.ts      # GET typeahead
  /api/companies/[slug]/route.ts      # GET cached report
/components
  /sidebar/*
  /search-combobox/*
  /report/*                           # generic shell, citation renderer
  /ui/*                               # shadcn primitives
/lib
  /sections/
    types.ts
    registry.ts
    snapshot.ts
    moat.ts
    founders.ts
    tech-stack.ts
    funding.ts
    traction.ts
    market.ts
  /anthropic.ts                       # SDK wrapper, web search enabled
  /supabase.ts
  /cache.ts                           # TTL logic, schemaVersion check
  /slug.ts                            # slug generation + collision handling
PRD.md
README.md
```

## 8. Design

See `DESIGN_PROMPT.md` for the full prompt to feed Claude (with shadcn MCP) to generate the design system and screen mockups. Direction in brief: editorial, reading-first, single accent color in the warm-neutral or muted-jewel-tone family, serif headlines + clean sans body, dark mode default, generous whitespace, charts that look like they belong in a research note.

## 9. Out of scope for v1

- User accounts, login, personal saved lists.
- Company comparison view.
- Email digests, alerts, watchlists.
- Editing or annotating reports.
- Browser extension.
- Native mobile (responsive web only).
- Per-section refresh (whole-report refresh only).
- Disambiguation UI for genuine name collisions (last-write-wins on slug).

## 10. Success criteria

- Researching a company you know well produces output where you'd say *"yeah, that's accurate and I learned at least one thing."*
- Time from search to first section visible: <8s.
- Time to full report: <90s.
- Cache hit on a previously-searched company: <500ms TTFB.
- Zero hallucinated citations — every cited URL must resolve and contain the claim. Validated by a CI check that samples cached reports.
- Adding a new section to the codebase takes <2 hours for a developer who has read this PRD.

## 11. Risks & honest limitations

- **Private company traction data is sparse.** Often the best we have is a Sacra estimate or headcount proxy. The product owns this rather than fakes precision.
- **MVP cost estimates are educated guesses.** Always labeled as such with methodology shown.
- **LinkedIn aggressively blocks scraping.** Founder photos and bios from LinkedIn directly are unreliable. Wikipedia, About pages, and Crunchbase public are more dependable.
- **The replicability score is opinionated by definition.** The fixed four-axis rubric makes it transparent and consistent across companies.
- **Web search results vary.** Same company on two days could differ slightly. Caching mitigates this within the TTL.

## 12. License

MIT.