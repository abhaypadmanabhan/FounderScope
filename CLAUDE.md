# FounderScope

Open-source company research tool for founders. Company name → 7-section report with cited sources. Hero feature: moat analysis with AI-native replicability score.

**Stack:** Next.js 14 App Router, TypeScript, shadcn/ui (base-nova), Tailwind, Supabase, OpenRouter via Vercel AI SDK v6 (Gemini 3.1 Flash Lite + DeepSeek V4 Pro) with EXA/Firecrawl/Tavily web search, Recharts.
**Status:** Phase 1-2 complete. Phase 3 (frontend) in progress.

## Reference Docs (read on demand)

- `docs/architecture.md` — directory structure, data flow, models, key files
- `docs/shadcn-reference.md` — MCP tool names and install patterns
- `DESIGN_PROMPT.md` — full design system and visual direction
- `PRD.md` — product requirements
- `SESSION_HANDOFF.md` — cross-session context

## Code Standards

- TypeScript strict. No `any`. Zod for validation. `interface` over `type`.
- App Router, Server Components default. `"use client"` only when needed.
- Tailwind utilities. shadcn/ui foundation. `cn()` for conditional classes.
- vitest tests in `__tests__/`. Run: `npm test`.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

## Cost Awareness

API calls ~$0.15/research on the current OpenRouter model map (was ~$1.00 pre-migration — see `docs/superpowers/specs/2026-07-28-openrouter-migration-design.md` §D2). Use `MOCK_RESEARCH=true` for frontend dev. Never hit live API without confirmation.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon key
SUPABASE_SERVICE_ROLE_KEY     — Server-only admin key
OPENROUTER_API_KEY            — Server-side fallback OpenRouter key (all inference)
EXA_API_KEY                   — Server-side fallback search key (required, not optional)
SEARCH_PROVIDER               — exa | firecrawl | tavily (default: exa)
MOCK_RESEARCH                 — "true" for fixture data
```

## Herdr (multi-agent orchestration) — verified 2026-07-24

Herdr (skill: `herdr`, requires `HERDR_ENV=1`) can dispatch real coding agents
(claude/codex/cursor/cline/agy) to real work in parallel panes — proven on a live
Tokei release: agents delivered full features unattended and merged clean. Verified
no-prompt auto-flags and gotchas (status can lie, claude-kind prompts can stall,
cursor/cline/agy need two-step paste + marker-based completion) are in the global
`~/.claude/CLAUDE.md`.
