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
    llm/             — OpenRouter adapter, model map, provider selection
    search/          — swappable web-search backends (EXA/Firecrawl/Tavily)
    api-keys.ts      — BYOK localStorage + request headers
    cache.ts         — Supabase cache layer
    citations.ts     — citation validation
    companies.ts     — company CRUD
    disambiguate.ts  — name disambiguation
    supabase/        — Supabase clients (browser, server, admin)
    slug.ts          — slug generation
  hooks/             — React hooks
__tests__/           — vitest tests
supabase/migrations/ — SQL migrations
```

## Section Registry Pattern

Each section is self-contained in `/lib/sections/`. Adding a section = new file + registry entry. No edits to orchestrator, cache, or report page. Section keys: `snapshot`, `moat`, `founders`, `tech_stack`, `funding`, `traction`, `market`.

## Data Flow

1. User searches → disambiguation (`default` tier + web search) → canonical slug
2. Check Supabase cache per-section (each has own TTL)
3. Cache miss → parallel section research (`reasoning` tier for moat, `default` for rest)
4. SSE stream results to client as sections complete
5. Cache in Supabase `reports` table

## Models

All inference routes through OpenRouter (Vercel AI SDK v6). Sections declare a
`tier`, never a model id; `src/lib/llm/models.ts` resolves tier → model.

- `reasoning` (moat): `deepseek/deepseek-v4-pro`
- `default` (other six sections + disambiguation): `google/gemini-3.1-flash-lite`

Overridable only via `FS_MODEL_REASONING` / `FS_MODEL_DEFAULT`, which exist for
the eval harness — the product UI never sets them.

## Web search

No model in the map ships a built-in web search, so search is a required
dependency, not a fallback. One `web_search` tool (`src/lib/llm/openrouter.ts`)
is backed by a swappable provider in `src/lib/search/`: EXA, Firecrawl, or
Tavily. A request with no search key fails with `missing_search_key`.

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Source of truth for product requirements |
| `DESIGN_PROMPT.md` | Design system and visual direction |
| `SESSION_HANDOFF.md` | Cross-session context and blockers |
| `src/lib/sections/registry.ts` | Section definitions and registration |
| `src/lib/sections/types.ts` | SectionDefinition interface |
| `src/lib/llm/openrouter.ts` | OpenRouter adapter + `web_search` tool loop |
| `src/lib/llm/models.ts` | Tier → model map |
| `src/lib/llm/select.ts` | Resolves BYOK keys into a provider config |
| `src/lib/api-keys.ts` | BYOK localStorage + request headers |
| `src/lib/cache.ts` | Supabase cache read/write |
| `src/lib/citations.ts` | Citation validation (resolved/gated/dead) |
| `components.json` | shadcn configuration (base-nova, neutral) |
