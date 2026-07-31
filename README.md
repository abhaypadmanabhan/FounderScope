# Founderscope

Type a company name or URL. In ~60 seconds get a structured founder's-eye view: what they do, who built it, their moat, their tech stack, how they got funded, what their traction looks like, and whether you could realistically compete. Built so a fellow founder learns something every search.

**Status: in development** (Phase 1 scaffold complete)

## Quickstart

```bash
git clone https://github.com/your-org/founderscope.git
cd founderscope
npm install
cp .env.local.example .env.local
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
# Optional: set OPENROUTER_API_KEY and EXA_API_KEY for local dev /
# self-hosting so the server uses them as fallbacks. Both are needed —
# inference routes through OpenRouter and web search is required, not
# optional. Leave unset for BYOK public deployments.
# Run the migration against your Supabase project:
# Option A: supabase db push  (if using Supabase CLI)
# Option B: paste supabase/migrations/0001_init.sql into the Supabase SQL editor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

- [PRD.md](./PRD.md) — full product requirements, architecture, and data model
- [DESIGN_PROMPT.md](./DESIGN_PROMPT.md) — design system generation prompt (shadcn MCP)

## License

MIT
