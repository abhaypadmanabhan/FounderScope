# FounderScope Architecture

## Directory Structure

```
src/
  app/
    (home)/          — landing page with search
    company/[slug]/  — report page (7 sections)
    settings/        — API key + theme toggle
    api/             — API routes
  components/
    ui/              — shadcn components
  lib/
    sections/        — section registry (self-contained modules)
    anthropic.ts     — Anthropic SDK client
    cache.ts         — Supabase cache layer
    citations.ts     — citation validation
    companies.ts     — company CRUD
    disambiguate.ts  — name disambiguation
    supabase.ts      — Supabase client
    slug.ts          — slug generation
  hooks/             — React hooks
__tests__/           — vitest tests
supabase/migrations/ — SQL migrations
```

## Section Registry Pattern

Each section is self-contained in `/lib/sections/`. Adding a section = new file + registry entry. No edits to orchestrator, cache, or report page. Section keys: `snapshot`, `moat`, `founders`, `tech_stack`, `funding`, `traction`, `market`.

## Data Flow

1. User searches → disambiguation (Haiku + web search) → canonical slug
2. Check Supabase cache per-section (each has own TTL)
3. Cache miss → parallel section research (Opus for moat, Haiku for rest)
4. SSE stream results to client as sections complete
5. Cache in Supabase `reports` table

## Models

- Moat section: `claude-opus-4-7` + `web_search_20260209`
- All other sections: `claude-haiku-4-5` + `web_search_20250305`
- Disambiguation: `claude-haiku-4-5` + `web_search_20250305`

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Source of truth for product requirements |
| `DESIGN_PROMPT.md` | Design system and visual direction |
| `SESSION_HANDOFF.md` | Cross-session context and blockers |
| `src/lib/sections/registry.ts` | Section definitions and registration |
| `src/lib/sections/types.ts` | SectionDefinition interface |
| `src/lib/anthropic.ts` | Anthropic SDK client setup |
| `src/lib/cache.ts` | Supabase cache read/write |
| `src/lib/citations.ts` | Citation validation (resolved/gated/dead) |
| `components.json` | shadcn configuration (base-nova, neutral) |
