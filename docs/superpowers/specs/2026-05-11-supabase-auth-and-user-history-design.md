# Supabase Auth + Per-User Search History — Design

Date: 2026-05-11
Status: Approved (design phase)
Implementation plan: TBD — see `docs/superpowers/plans/` after this spec.

## Context

FounderScope currently has no user accounts. Anyone hitting the deployed app sees the same global `search_history` table feeding the sidebar — one person researching "Stripe" pollutes another person's recents. The product is built for individual founders doing personal research, so a shared sidebar leaks signal and breaks the product fantasy of "your private research workspace".

This spec adds Supabase Auth as a required gate on every page and scopes `search_history` per user. Cached company reports remain shared across users (the whole point of the cache is to amortize Anthropic + Exa costs across the user base) — only the *which-companies-has-this-user-looked-at* fact becomes per-user.

## Goals

1. Required login on every route via Supabase Auth. Anonymous visitors land on `/login`.
2. Two sign-in paths: Google OAuth and email magic link.
3. Per-user `search_history`, enforced by Row Level Security so a forgotten `.eq("user_id", ...)` filter cannot leak data.
4. Sidebar starts empty for a new user; populates only with companies that user has researched.
5. The search palette (`⌘K`) shows matches scoped to the user's own history. Unmatched queries fall through to the existing "Research [name]" CTA, which runs the full pipeline and (after success) adds the company to the user's sidebar.
6. Cached reports continue to short-circuit live API calls regardless of whether the current user is the one who originally triggered the research.

## Non-Goals (deferred)

- Migrating API keys (Anthropic / Kimi / Exa) from `localStorage` into per-user encrypted storage in the DB. Keys stay client-side for now.
- Profile / settings UI beyond the existing `/settings` API-keys page (no display name, no avatar upload, no preferences).
- Email-verification flows beyond Supabase defaults.
- Account-deletion UI. (Database `on delete cascade` is in place; admin can delete from Supabase dashboard.)
- Multi-tenant team workspaces.
- Plan tiers / usage limits / billing.

## Architecture

**Auth backend**: Supabase Auth (built-in `auth.users` table, JWT cookies).

**Auth client**: `@supabase/ssr` package — supports Server Components, Route Handlers, middleware, and Client Components from a single library. Stores session in `sb-*` HttpOnly cookies.

**Two server-side Supabase clients**:

- `supabaseUser(req)` — anon-key client that reads the user's cookies. RLS-enforced. Used for any per-user query (currently just `search_history`). Constructed per request.
- `supabaseAdmin` — service-role client. Same as today's `src/lib/supabase.ts`. Bypasses RLS. Used only for cross-user shared tables: `companies`, `reports`, `exa_search_cache`. Kept as a module-level singleton.

**Client-side**: `createBrowserClient` from `@supabase/ssr`. Powers sign-in, sign-out, OAuth redirect, and reading the live session in components that need it (sidebar footer for the avatar).

**Route protection**: `src/middleware.ts` runs on every matched request, refreshes the session cookie if Supabase needs to, and redirects unauthenticated requests to `/login?next=<originalPath>`.

## Components

### `src/lib/supabase/`

Replaces the single-file `src/lib/supabase.ts`. Directory layout:

```
src/lib/supabase/
  admin.ts         — service-role client (export `supabaseAdmin`). The current
                     `supabase` export from supabase.ts moves here, renamed.
  server.ts        — `supabaseServer(cookieStore)` factory for RSC + route handlers.
  middleware.ts    — `updateSession(req, res)` helper called from middleware.ts.
  browser.ts       — `supabaseBrowser()` factory for Client Components.
```

All existing imports `from "@/lib/supabase"` migrate to `from "@/lib/supabase/admin"`.

### `src/middleware.ts` (new)

- Matcher excludes: `/_next/*`, `/favicon.ico`, `/fonts/*`, static assets, `/api/auth/*`, `/login`, `/auth/callback`.
- For every other path: refresh session cookies via `updateSession`. If no user, 302 to `/login?next=<pathname+search>` (omit `next` if path is `/`).
- The middleware response must propagate the cookies Supabase may have updated during refresh (critical — drop this and tokens silently expire).

### `src/app/login/page.tsx` (new)

Server Component shell + Client Component form. Already-authenticated visitors get redirected to `/` immediately (handled in the Server Component via `supabaseServer().auth.getUser()`).

Form UI (Client Component) is built via the `frontend-design:frontend-design` skill. Sketch:

- Two-column desktop, single-column mobile.
- Left: brand + Logomark + one-line tagline.
- Right: card containing
  1. **Continue with Google** button (full-width, primary).
  2. Divider "or".
  3. Email `<input>` + **Send magic link** button.
- On magic-link submit → swap form for "Check your inbox at `<email>`" panel with "use a different email" reset.
- Error banner above card when `?error=<code>` present (`link_invalid`, `oauth_cancelled`, generic).

### `src/app/auth/callback/route.ts` (new)

Route Handler. Reads `code` from the search params, exchanges via `supabaseServer().auth.exchangeCodeForSession(code)`, redirects to `searchParams.next ?? "/"`. On failure → `/login?error=link_invalid`.

### Sidebar (`src/components/app-sidebar.tsx`)

Two additions:

1. **User row in footer**, above the Settings link:
   - Avatar (Google `user_metadata.avatar_url` if present, else initials block matching the existing `<CompanyLogo>` style).
   - Email beside avatar.
   - Sign-out icon button on the right (when expanded). When collapsed, the avatar itself becomes a button with a `Sign out` tooltip.
2. No change to the "Recently researched" group's component code. Its API call (`/api/search-history`) starts returning per-user data once the endpoint is updated.

Avatar + email loaded via `supabaseBrowser().auth.getUser()` inside a small `<UserBadge>` Client Component. Initial render falls back to a skeleton until session resolves to avoid hydration flicker.

### API routes

| Route | Change |
|---|---|
| `/api/search-history` GET/POST | Switch internal client from `supabaseAdmin` to `supabaseServer`. RLS auto-scopes. Reject 401 if no user. Replace "delete prior rows + insert" with `upsert({user_id, company_id, searched_at: now()}, { onConflict: "user_id,company_id" })` using the new composite unique index. |
| `/api/companies/search` | Join `companies` ↔ `search_history` on `user_id = auth.uid()` so only researched companies surface. Use `supabaseServer`. |
| `/api/research` POST | Read user from `supabaseServer().auth.getUser()`. 401 if absent. After disambiguation succeeds (before parallel section fan-out), upsert `search_history (user_id, company_id)`. Keeps existing `touchLastRefreshed` call. |
| `/api/companies/[slug]` | Reads from shared `companies` + `reports` — stays on `supabaseAdmin`. No user filter (cache is public). |

## Data flow

### New-user first research

1. User visits `/`, no cookies → middleware → 302 `/login`.
2. Signs in via Google → `/auth/callback` → cookies set → redirect to `/`.
3. Sidebar renders. Footer shows user. "Recently researched" is empty.
4. ⌘K → types "Stripe" → `/api/companies/search?q=stripe` → joins through `search_history` filtered by `auth.uid()` → returns `[]` (user has nothing yet).
5. Palette shows "Research Stripe" CTA → POST `/api/research`.
6. Route reads user, runs disambiguation, inserts `search_history (user_id, company_id)` row, kicks off section fan-out, streams SSE.
7. Sections complete (cached if another user previously did Stripe; live if not).
8. Sidebar refreshes (existing `useRecents` SWR or interval) → Stripe appears.

### Repeat user

Same flow, except step 4 returns Stripe → click → `/company/stripe` loads from `reports` cache. No `/api/research` call. No new `search_history` row inserted (idempotent via the upsert below).

### Two users, same company

User A researches Stripe. Reports cached. User B logs in, types "Stripe" → palette returns empty (B's history). Falls through to research CTA. POST `/api/research` runs disambiguation against Supabase cache (hit), each section's cache returns instantly, SSE completes in seconds. B's `search_history` gets a row pointing to the same `company_id`. Both users now have Stripe in their respective sidebars.

## Database migration

`supabase/migrations/0003_auth_and_user_history.sql`:

```sql
-- Auth schema is provided by Supabase. No CREATE for auth.users.

-- Drop existing rows: pre-launch state, no real owners to preserve.
delete from search_history;

-- Add owner column with strict reference.
alter table search_history
  add column user_id uuid not null references auth.users(id) on delete cascade;

-- Composite uniqueness so upserts replace prior visits per user+company.
-- This is the conflict target for the POST handler's upsert (which sets
-- searched_at = now()) — replaces the route's old "delete then insert"
-- pattern. The original `id` primary key stays in place.
create unique index search_history_user_company_unique
  on search_history(user_id, company_id);

-- Hot-path index: sidebar query = last 8 visits for a user.
create index search_history_user_recent_idx
  on search_history(user_id, searched_at desc);

-- Lock the table to its owner.
alter table search_history enable row level security;

create policy "users select own history"
  on search_history for select
  using (user_id = auth.uid());

create policy "users insert own history"
  on search_history for insert
  with check (user_id = auth.uid());

create policy "users delete own history"
  on search_history for delete
  using (user_id = auth.uid());

-- companies, reports, exa_search_cache: no RLS. Service-role-only writes.
-- Anon-key client cannot reach these tables directly; nothing to lock.
```

Run via `supabase db push` (or paste into the Supabase SQL editor).

## Error handling

| Condition | Behavior |
|---|---|
| Middleware sees no user on protected route | 302 `/login?next=<path>` (no `next` for `/`) |
| Magic link expired or already used | callback → `/login?error=link_invalid`, login page renders banner |
| Google OAuth cancelled | callback → `/login?error=oauth_cancelled`, banner |
| Unexpected callback error | `/login?error=auth_error` |
| `/api/research` POST without session | 401 JSON; client palette catches it and redirects to `/login` |
| `/api/search-history` GET without session | 401 JSON; sidebar shows empty state |
| RLS rejects a cross-user read | Empty result set (silent — exactly what we want) |
| Token refresh fails mid-session | Middleware redirects to `/login` next navigation |

## Testing

vitest (mock Supabase client + cookies):

- `__tests__/middleware-auth.test.ts` — protected path with no cookie → redirect to `/login?next=…`. Authenticated cookie → pass through. Excluded path (`/login`, `/_next/...`) → never redirect even when unauthenticated.
- `__tests__/auth-callback.test.ts` — valid `code` → session exchanged → redirect to `next` param. Invalid code → redirect to `/login?error=link_invalid`.
- `__tests__/search-history-user-scoped.test.ts` — GET uses `supabaseServer` (not `supabaseAdmin`). POST inserts a row with the authenticated `user_id`.
- `__tests__/research-records-history.test.ts` — orchestrator inserts `search_history (user_id, company_id)` after disambiguation succeeds. 401 returned when no session.
- `__tests__/companies-search-user-scoped.test.ts` — query joins `search_history` filtered by user. Returns `[]` when user has no history.

Manual E2E in dev (Supabase local + real Google OAuth in dev project):

- Magic link round-trip via Inbucket (Supabase local SMTP catcher).
- Google OAuth round-trip (real provider, dev redirect URL whitelisted).
- Two-user isolation: search "Stripe" as A → log out → log in as B → sidebar empty → search "Stripe" as B → instant (cached report) → B's sidebar shows Stripe, A's unaffected.

## Dependencies

Add: `@supabase/ssr` (latest, currently in the 0.5–0.6 range).

No removals. The existing `@supabase/supabase-js` stays as a transitive dep.

## Environment variables

Document in `.env.local.example`:

- `NEXT_PUBLIC_SUPABASE_URL` — already exists (currently named `SUPABASE_URL` — rename or alias; the SSR client expects the `NEXT_PUBLIC_` prefix because the browser client uses it).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — new. Public anon key, exposed to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — already exists. Server only.
- Google OAuth credentials are configured in the Supabase dashboard (Auth → Providers), not in env vars.

## Rollout

This is a breaking change for any existing deployment (cookie-less requests now redirect to `/login`). Phase-3 branch only; no production users yet, so no migration of existing accounts is needed.

Order of operations on deploy:

1. Apply migration `0003_auth_and_user_history.sql`.
2. Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel env.
3. Configure Google OAuth + magic-link providers in Supabase Auth dashboard. Add `https://<vercel-deploy>/auth/callback` to allowed redirect URLs.
4. Deploy code.

## File-by-file change summary

| Path | Action |
|---|---|
| `package.json` | add `@supabase/ssr` |
| `supabase/migrations/0003_auth_and_user_history.sql` | new |
| `src/lib/supabase.ts` | delete (split into directory below) |
| `src/lib/supabase/admin.ts` | new — service-role client (formerly the export from supabase.ts) |
| `src/lib/supabase/server.ts` | new — per-request user-scoped client |
| `src/lib/supabase/middleware.ts` | new — `updateSession` helper |
| `src/lib/supabase/browser.ts` | new — browser client factory |
| `src/middleware.ts` | new |
| `src/app/login/page.tsx` | new — Server Component shell |
| `src/app/login/login-form.tsx` | new — Client Component form (UI via frontend-design skill) |
| `src/app/auth/callback/route.ts` | new |
| `src/components/user-badge.tsx` | new — sidebar footer user row |
| `src/components/app-sidebar.tsx` | edit — inject `<UserBadge>` above settings |
| `src/app/api/search-history/route.ts` | edit — switch to user client, drop delete-prior logic |
| `src/app/api/companies/search/route.ts` | edit — join through search_history |
| `src/app/api/research/route.ts` | edit — 401 if no user; record `search_history` row post-disambig |
| `src/lib/cache.ts`, `src/lib/companies.ts`, `src/lib/llm/tools/exa-cache.ts` | edit imports `@/lib/supabase` → `@/lib/supabase/admin` |
| `.env.local.example` | document `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `__tests__/*` | new + edits per Testing section |
