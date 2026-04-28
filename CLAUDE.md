# FounderScope

Open-source company research tool for founders. Company name → 7-section report with cited sources. Hero feature: moat analysis with AI-native replicability score.

**Stack:** Next.js 14 App Router, TypeScript, shadcn/ui (base-nova), Tailwind, Supabase, Anthropic SDK + web search, Recharts.
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

API calls ~$1.00/research. Use `MOCK_RESEARCH=true` for frontend dev. Never hit live API without confirmation.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon key
ANTHROPIC_API_KEY             — Server-side Anthropic key
MOCK_RESEARCH                 — "true" for fixture data
```
