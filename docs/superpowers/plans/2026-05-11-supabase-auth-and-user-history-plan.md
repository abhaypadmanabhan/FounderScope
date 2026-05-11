# Supabase Auth + Per-User Search History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every route behind Supabase Auth (Google + email magic link) and scope `search_history` per authenticated user via RLS, so each founder gets a private research workspace while the cross-user `companies` / `reports` / `exa_search_cache` tables remain shared.

**Architecture:** Split the single service-role `supabase.ts` into four `@supabase/ssr`-based clients (`admin`, `server`, `middleware`, `browser`). A new `src/middleware.ts` refreshes the session cookie on every request and redirects unauthenticated users to `/login?next=<path>`. `/api/research`, `/api/search-history`, and `/api/companies/search` switch to the per-request user client so RLS auto-scopes reads/writes. A composite unique index `(user_id, company_id)` on `search_history` lets the POST handler upsert instead of delete-then-insert.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, `@supabase/ssr` (NEW), `@supabase/supabase-js` (transitive), Zod, Vitest, shadcn/ui (base-nova), Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-11-supabase-auth-and-user-history-design.md`. The spec is the source of truth for scope. Read it before starting any slice.

**Slice ordering rationale:** Each slice ends with `npm test && npm run build` green so the branch is shippable at any checkpoint. Slice 1 is a pure refactor (no behavior change). Slice 2 ships a migration file but no code that needs it yet (user runs it manually before slice 4 manual test, but slice-4 unit tests mock Supabase so they pass regardless). Slices 3–4 introduce the auth gate behind a feature path that is internally consistent. Slice 5 is the polished login UI (depends on `frontend-design`). Slice 6 adds the sidebar badge. Slice 7 finalizes env docs and manual-test checklist.

**Out-of-scope reminders (from spec § Non-Goals):**
- Encrypted per-user API-key storage (keys stay in `localStorage`).
- Profile / settings UI beyond `/settings` API keys.
- Account deletion UI.
- Multi-tenant team workspaces.

---

## File Structure

| Path | Slice | Action |
|---|---|---|
| `package.json` | 1 | add `@supabase/ssr` |
| `src/lib/supabase.ts` | 1 | delete |
| `src/lib/supabase/admin.ts` | 1 | new — service-role singleton (current `supabase` export, renamed `supabaseAdmin`) |
| `src/lib/supabase/server.ts` | 1 | new — `supabaseServer(cookieStore)` factory for RSC + route handlers |
| `src/lib/supabase/middleware.ts` | 1 | new — `updateSession(request)` helper |
| `src/lib/supabase/browser.ts` | 1 | new — `supabaseBrowser()` factory for Client Components |
| `src/lib/cache.ts` | 1 | update import |
| `src/lib/companies.ts` | 1 | update import |
| `src/lib/llm/tools/exa-cache.ts` | 1 | update import |
| `src/app/api/search-history/route.ts` | 1, 4 | slice 1: import only; slice 4: swap to `supabaseServer`, add upsert + 401 |
| `src/app/api/companies/search/route.ts` | 1, 4 | slice 1: import only; slice 4: join through `search_history` |
| `src/app/api/companies/[slug]/route.ts` | 1 | import only (stays admin — cache is public) |
| `src/app/api/research/route.ts` | 4 | add 401 + `search_history` upsert |
| `__tests__/exa-cache.test.ts` | 1 | update mock path |
| `supabase/migrations/0003_auth_and_user_history.sql` | 2 | new |
| `src/middleware.ts` | 3 | new |
| `src/app/auth/callback/route.ts` | 3 | new |
| `src/app/login/page.tsx` | 3, 5 | slice 3: minimal server-component shell; slice 5: polished UI |
| `src/app/login/login-form.tsx` | 5 | new — Client Component (form built via `frontend-design`) |
| `src/components/user-badge.tsx` | 6 | new — sidebar footer user row |
| `src/components/app-sidebar.tsx` | 6 | inject `<UserBadge>` above settings |
| `.env.local.example` | 1, 7 | slice 1: add `NEXT_PUBLIC_SUPABASE_URL` + anon key entries; slice 7: final polish |
| `__tests__/middleware-auth.test.ts` | 3 | new |
| `__tests__/auth-callback.test.ts` | 3 | new |
| `__tests__/search-history-user-scoped.test.ts` | 4 | new |
| `__tests__/companies-search-user-scoped.test.ts` | 4 | new |
| `__tests__/research-records-history.test.ts` | 4 | new |

---

## Slice 1 — Split Supabase client + add `@supabase/ssr`

**Goal:** Pure refactor. No user-visible behavior change. Single-file `supabase.ts` → four-file `supabase/` directory. All existing tests + build remain green.

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/browser.ts`
- Delete: `src/lib/supabase.ts`
- Modify: `package.json`, `src/lib/cache.ts`, `src/lib/companies.ts`, `src/lib/llm/tools/exa-cache.ts`, `src/app/api/search-history/route.ts`, `src/app/api/companies/search/route.ts`, `src/app/api/companies/[slug]/route.ts`, `__tests__/exa-cache.test.ts`, `.env.local.example`

- [ ] **Step 1: Install `@supabase/ssr`**

Run:
```bash
npm install @supabase/ssr@latest
```

Expected: `package.json` `dependencies` gains `"@supabase/ssr": "^0.5.x"` (or later 0.x). `package-lock.json` updates. Re-run `npm install` if a previous attempt left a partial state.

- [ ] **Step 2: Create `src/lib/supabase/admin.ts`** (service-role singleton, replaces current `src/lib/supabase.ts`)

```ts
// Service-role Supabase client. Server-only. Bypasses RLS.
// Used for cross-user shared tables: companies, reports, exa_search_cache.
// Never import this from a Client Component or anything reachable from the browser bundle.
import { createClient } from "@supabase/supabase-js";

// Safe placeholders so build-time static analysis doesn't blow up; real
// values required at runtime.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
```

Note: both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` are accepted to bridge the env rename without breaking anyone who hasn't updated `.env.local` yet.

- [ ] **Step 3: Create `src/lib/supabase/server.ts`** (per-request user client for RSC + route handlers)

```ts
// Per-request, anon-key, cookie-aware Supabase client for Server Components
// and Route Handlers. RLS-enforced — reads `auth.uid()` from the JWT in the
// `sb-*` cookies. Construct once per request; do not cache across requests.
import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options?: Record<string, unknown>): void;
};

export function supabaseServer(cookieStore: CookieStore) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "https://placeholder.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

  const cookies: CookieMethodsServer = {
    getAll() {
      // next/headers cookies() doesn't expose getAll on every version; emulate via
      // a single get() loop is impossible without a name list, so we read what we
      // need on demand. @supabase/ssr falls back to per-cookie reads via get().
      return [];
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set?.(name, value, options);
        }
      } catch {
        // Server Component path: cookies are read-only. Ignore silently;
        // middleware.ts is the writer of record.
      }
    },
  };

  return createServerClient(url, anonKey, { cookies });
}
```

Why this signature: the caller passes Next's `cookies()` (route handler) or a Server-Component cookie store. The `set` path is no-op-on-throw because Server Components can't write cookies — that's the middleware's job.

- [ ] **Step 4: Create `src/lib/supabase/middleware.ts`** (cookie refresh helper used by `src/middleware.ts`)

```ts
// Session-refresh helper for Next.js middleware. Mutates the outgoing
// NextResponse to carry any refreshed `sb-*` cookies. Returns the user
// (or null) so callers can short-circuit on unauthenticated requests.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: User | null;
}> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "https://placeholder.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  return { response, user: data.user ?? null };
}
```

Critical detail: every time we set a cookie on `request`, we must rebuild `response` from the mutated request and re-apply the cookies on the response. Drop this and tokens silently fail to refresh.

- [ ] **Step 5: Create `src/lib/supabase/browser.ts`** (client-side singleton factory)

```ts
// Browser-only Supabase client. Stores session in `sb-*` cookies (HttpOnly
// for the access/refresh tokens — managed by @supabase/ssr).
import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
  );
  return cached;
}
```

- [ ] **Step 6: Delete `src/lib/supabase.ts`**

Run:
```bash
rm src/lib/supabase.ts
```

- [ ] **Step 7: Update imports in `src/lib/cache.ts`**

Edit line 2:
- Old: `import { supabase } from "./supabase";`
- New: `import { supabaseAdmin as supabase } from "./supabase/admin";`

Rationale for the alias: keeps the local variable name `supabase` so the rest of the file (multiple call sites) needs no further changes.

- [ ] **Step 8: Update imports in `src/lib/companies.ts`**

Edit line 2:
- Old: `import { supabase } from "./supabase";`
- New: `import { supabaseAdmin as supabase } from "./supabase/admin";`

- [ ] **Step 9: Update imports in `src/lib/llm/tools/exa-cache.ts`**

Find the line `import { supabase } from "..."` near the top of the file (path is relative — likely `"../../supabase"`). Replace with:
```ts
import { supabaseAdmin as supabase } from "../../supabase/admin";
```

- [ ] **Step 10: Update imports in the three API routes** (admin-only for now; slice 4 changes the user-scoped ones)

In each of:
- `src/app/api/search-history/route.ts`
- `src/app/api/companies/search/route.ts`
- `src/app/api/companies/[slug]/route.ts`

Replace `import { supabase } from "@/lib/supabase";` with:
```ts
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";
```

- [ ] **Step 11: Update mock path in `__tests__/exa-cache.test.ts`**

Edit lines 7–9:
- Old:
  ```ts
  vi.mock("@/lib/supabase", () => ({
    supabase: { from: (...args: unknown[]) => fromMock(...args) },
  }));
  ```
- New:
  ```ts
  vi.mock("@/lib/supabase/admin", () => ({
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  }));
  ```

- [ ] **Step 12: Update `.env.local.example`** (preview the env names; full polish in slice 7)

Replace the existing Supabase block with:
```dotenv
# Supabase — create a project at supabase.com, find these in Settings > API
# NEXT_PUBLIC_SUPABASE_URL is consumed by both server and browser clients.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

Note: `SUPABASE_URL` (the old name) is still accepted by `admin.ts` as a fallback. Existing local env files keep working through slice 1.

- [ ] **Step 13: Run tests and build**

Run:
```bash
npm test
```
Expected: all existing tests pass (~23 files, ~all green). The only file that should have changed test-wise is `exa-cache.test.ts` (mock path).

Run:
```bash
npm run build
```
Expected: clean Next.js production build. No type errors.

If either fails, STOP and invoke `superpowers:systematic-debugging`. Do not move on.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json src/lib/supabase __tests__/exa-cache.test.ts src/lib/cache.ts src/lib/companies.ts src/lib/llm/tools/exa-cache.ts src/app/api .env.local.example
git rm src/lib/supabase.ts
git commit -m "refactor(supabase): split client into admin/server/middleware/browser via @supabase/ssr"
```

---

## Slice 2 — Database migration

**Goal:** Land `0003_auth_and_user_history.sql` so the user can apply it before slice-4 manual testing. No code in this slice depends on the migration (slice-4 tests mock Supabase). The migration is committed but **not applied** by this agent — the user runs `supabase db push` themselves.

**Files:**
- Create: `supabase/migrations/0003_auth_and_user_history.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_auth_and_user_history.sql`:

```sql
-- 0003_auth_and_user_history.sql
-- Adds per-user ownership + RLS to search_history.
-- companies, reports, exa_search_cache remain service-role-only (no RLS).
-- Run via: supabase db push  (or paste into the Supabase SQL editor).

-- Pre-launch state: no real owners to migrate. Wipe rather than guess.
delete from search_history;

-- Owner column. Cascade delete so removing a Supabase user cleans up their history.
alter table search_history
  add column user_id uuid not null references auth.users(id) on delete cascade;

-- Composite uniqueness so the POST handler's upsert (onConflict user_id,company_id)
-- replaces prior visits per user+company. The original `id` primary key stays.
create unique index search_history_user_company_unique
  on search_history(user_id, company_id);

-- Hot-path index for the sidebar query: last 8 visits for a user.
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
```

- [ ] **Step 2: Verify it's syntactically reasonable**

Run:
```bash
cat supabase/migrations/0003_auth_and_user_history.sql | wc -l
```
Expected: roughly 30 non-empty lines (sanity check that the file landed).

- [ ] **Step 3: Run tests and build**

Run:
```bash
npm test && npm run build
```
Expected: still green. This slice only adds a SQL file, no code is touched.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_auth_and_user_history.sql
git commit -m "feat(supabase): migration 0003 — search_history user_id + RLS + composite unique index"
```

---

## Slice 3 — Middleware + auth callback + login shell

**Goal:** Wire the auth gate. After this slice, hitting `/` while logged out redirects to `/login`. The `/login` page renders a placeholder ("login UI coming in slice 5") and the callback handler exchanges OAuth/magic-link codes. The login form itself is intentionally minimal — slice 5 replaces it via the `frontend-design` skill.

**Files:**
- Create: `src/middleware.ts`, `src/app/auth/callback/route.ts`, `src/app/login/page.tsx`, `__tests__/middleware-auth.test.ts`, `__tests__/auth-callback.test.ts`

- [ ] **Step 1: Write the middleware test first**

Create `__tests__/middleware-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @supabase/ssr to control `getUser()` behavior.
const getUserMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

// Stub next/server's NextResponse with a minimal shape sufficient for our assertions.
class FakeHeaders {
  private m = new Map<string, string>();
  get(k: string) { return this.m.get(k.toLowerCase()) ?? null; }
  set(k: string, v: string) { this.m.set(k.toLowerCase(), v); }
}
class FakeResponse {
  status: number;
  headers = new FakeHeaders();
  cookies = { set: vi.fn(), getAll: () => [] };
  constructor(status = 200) { this.status = status; }
}
vi.mock("next/server", async () => {
  return {
    NextResponse: {
      next: () => new FakeResponse(200),
      redirect: (url: URL) => {
        const r = new FakeResponse(307);
        r.headers.set("location", url.toString());
        return r;
      },
    },
  };
});

import { middleware } from "@/middleware";

function makeRequest(pathname: string, search = ""): unknown {
  const url = new URL(`https://app.test${pathname}${search}`);
  return {
    nextUrl: url,
    url: url.toString(),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  };
}

beforeEach(() => {
  getUserMock.mockReset();
});

describe("middleware auth gate", () => {
  it("redirects unauthenticated users on protected paths to /login?next=<path>", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = (await middleware(makeRequest("/company/stripe") as never)) as unknown as FakeResponse;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/login?next=%2Fcompany%2Fstripe");
  });

  it("omits the next param when redirecting from the root", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = (await middleware(makeRequest("/") as never)) as unknown as FakeResponse;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/login");
  });

  it("lets authenticated users through", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } } });
    const res = (await middleware(makeRequest("/company/stripe") as never)) as unknown as FakeResponse;
    expect(res.status).toBe(200);
  });
});
```

Note: the `config.matcher` in `src/middleware.ts` does the excluding for `/login`, `/_next/*`, etc. — Next's runtime applies the matcher, not the middleware function body. We assert the matcher value separately:

Append to the same test file:

```ts
import { config } from "@/middleware";

describe("middleware matcher", () => {
  it("excludes /login, /auth, static files, and /_next from matching", () => {
    const matcher = (config as { matcher: string | string[] }).matcher;
    const m = Array.isArray(matcher) ? matcher.join("\n") : matcher;
    expect(m).toMatch(/login/);
    expect(m).toMatch(/auth/);
    expect(m).toMatch(/_next/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
npm test -- middleware-auth
```
Expected: FAIL with "Cannot find module '@/middleware'" (file doesn't exist yet).

- [ ] **Step 3: Implement `src/middleware.ts`**

Create `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (user) return response;

  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on every path EXCEPT static assets and the auth-flow pages themselves.
  // Anything matching this matcher hits the middleware; everything else passes
  // through untouched (no session refresh — fine for static files).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|login|auth/callback|api/auth).*)",
  ],
};
```

Why this matcher: it whitelists by exclusion. Pages that absolutely must never redirect to /login (the login page, the callback) are excluded. API routes that need auth still match — they get the session refresh, and if the user is missing they get redirected to /login (browsers follow it; fetch callers from the app will be authenticated already, and any unauthenticated curl gets the redirect as expected).

- [ ] **Step 4: Run the middleware test until it passes**

Run:
```bash
npm test -- middleware-auth
```
Expected: PASS. If failing, debug before moving on.

- [ ] **Step 5: Write the auth-callback test first**

Create `__tests__/auth-callback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: exchangeMock },
  }),
}));

// next/headers cookies() — return a minimal stub.
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined,
    set: vi.fn(),
    getAll: () => [],
  }),
}));

// We import after the mocks are in place.
import { GET } from "@/app/auth/callback/route";

function makeReq(url: string) {
  return new Request(url);
}

beforeEach(() => {
  exchangeMock.mockReset();
});

describe("/auth/callback", () => {
  it("redirects to / when no code is present", async () => {
    const res = await GET(makeReq("https://app.test/auth/callback"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/login?error=auth_error");
  });

  it("exchanges code and redirects to next on success", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    const res = await GET(makeReq("https://app.test/auth/callback?code=abc&next=%2Fcompany%2Fstripe"));
    expect(exchangeMock).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/company/stripe");
  });

  it("redirects to / when next is missing", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    const res = await GET(makeReq("https://app.test/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe("https://app.test/");
  });

  it("redirects to login on exchange failure with link_invalid error", async () => {
    exchangeMock.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(makeReq("https://app.test/auth/callback?code=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/login?error=link_invalid");
  });
});
```

- [ ] **Step 6: Run the test to confirm it fails**

Run:
```bash
npm test -- auth-callback
```
Expected: FAIL with "Cannot find module '@/app/auth/callback/route'".

- [ ] **Step 7: Implement `src/app/auth/callback/route.ts`**

Create `src/app/auth/callback/route.ts`:

```ts
// OAuth + magic-link callback. Supabase redirects here with ?code=<one-time>.
// We exchange the code for a session (which sets `sb-*` cookies via the
// server client) and then redirect to the original destination.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_error", url.origin));
  }

  const supabase = supabaseServer(cookies() as unknown as Parameters<typeof supabaseServer>[0]);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=link_invalid", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
```

- [ ] **Step 8: Run the auth-callback test until it passes**

Run:
```bash
npm test -- auth-callback
```
Expected: PASS all four cases.

- [ ] **Step 9: Implement `src/app/login/page.tsx` (minimal shell — slice 5 polishes the UI)**

Create `src/app/login/page.tsx`:

```tsx
// Login page. Already-authenticated visitors get bounced to home immediately.
// The UI form is the minimal placeholder until slice 5 swaps in the
// frontend-design-built `<LoginForm />`. Both Google OAuth and email magic
// link route through /auth/callback.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const supabase = supabaseServer(cookies() as unknown as Parameters<typeof supabaseServer>[0]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(searchParams.next ?? "/");
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-serif, serif)", color: "var(--text, #222)" }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Sign in to FounderScope</h1>
      {searchParams.error ? (
        <p style={{ color: "crimson", marginBottom: 16 }}>{errorMessage(searchParams.error)}</p>
      ) : null}
      <p style={{ color: "var(--text-quiet, #888)" }}>Login UI lands in the next slice.</p>
    </main>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "link_invalid":
      return "That magic link expired or was already used. Request a new one.";
    case "oauth_cancelled":
      return "Sign-in cancelled.";
    default:
      return "Sign-in failed. Try again.";
  }
}
```

- [ ] **Step 10: Run tests and build**

Run:
```bash
npm test && npm run build
```
Expected:
- All 25+ test files pass (23 existing + middleware-auth + auth-callback).
- `npm run build` succeeds. Routes show `/login`, `/auth/callback` in the build output.

If build complains about `cookies()` typing in `server.ts` or the route handler, the `as unknown as Parameters<typeof supabaseServer>[0]` cast is intentional — Next 14's `cookies()` return type differs from the bare `CookieStore` shape we typed. If a cleaner type is available in your `@supabase/ssr` version, use it.

- [ ] **Step 11: Commit**

```bash
git add src/middleware.ts src/lib/supabase/middleware.ts src/lib/supabase/server.ts src/app/auth src/app/login __tests__/middleware-auth.test.ts __tests__/auth-callback.test.ts
git commit -m "feat(auth): middleware session gate + /auth/callback + /login shell"
```

---

## Slice 4 — User-scoped API routes

**Goal:** Switch `/api/search-history`, `/api/companies/search`, and `/api/research` to the per-request user client. Add 401s. Replace delete-then-insert with upsert on the new composite unique index. The companies/search route joins through `search_history` so only researched companies surface.

**Files:**
- Modify: `src/app/api/search-history/route.ts`, `src/app/api/companies/search/route.ts`, `src/app/api/research/route.ts`
- Create: `__tests__/search-history-user-scoped.test.ts`, `__tests__/companies-search-user-scoped.test.ts`, `__tests__/research-records-history.test.ts`

- [ ] **Step 1: Write the search-history test first**

Create `__tests__/search-history-user-scoped.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: vi.fn(), getAll: () => [] }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    auth: { getUser: getUserMock },
    from: (...args: unknown[]) => fromMock(...args),
  }),
}));

import { GET, POST } from "@/app/api/search-history/route";

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("GET /api/search-history", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("queries search_history scoped via auth-cookie client", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({
      data: [
        { searched_at: "2026-05-11T10:00:00Z", companies: { slug: "stripe", display_name: "Stripe" } },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order, limit });
    order.mockReturnValue({ limit });
    fromMock.mockReturnValue({ select });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([
      { slug: "stripe", display_name: "Stripe", searched_at: "2026-05-11T10:00:00Z" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("search_history");
  });
});

describe("POST /api/search-history", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new Request("https://app.test/api/search-history", {
      method: "POST",
      body: JSON.stringify({ slug: "stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("upserts a search_history row with the authenticated user_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "co1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });

    fromMock.mockImplementation((table: string) => {
      if (table === "companies") return { select };
      if (table === "search_history") return { upsert };
      throw new Error(`unexpected table ${table}`);
    });

    const req = new Request("https://app.test/api/search-history", {
      method: "POST",
      body: JSON.stringify({ slug: "stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row).toMatchObject({ user_id: "u1", company_id: "co1" });
    expect(row.searched_at).toBeTruthy();
    expect(opts).toEqual({ onConflict: "user_id,company_id" });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
npm test -- search-history-user-scoped
```
Expected: FAIL. The route still uses the admin client; the user-aware behavior isn't there.

- [ ] **Step 3: Rewrite `src/app/api/search-history/route.ts`**

Replace the file contents with:

```ts
// GET — last 8 companies this user visited, most recent first.
// POST — record (or refresh) a visit. Upserts on (user_id, company_id) so a
// repeat visit just bumps `searched_at`.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecentRow = {
  searched_at: string;
  companies: { slug: string; display_name: string } | null;
};

function client() {
  return supabaseServer(cookies() as unknown as Parameters<typeof supabaseServer>[0]);
}

export async function GET() {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ entries: [] });
  }

  const supabase = client();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("search_history")
    .select("searched_at, companies!inner(slug, display_name)")
    .order("searched_at", { ascending: false })
    .limit(8);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = ((data ?? []) as unknown as RecentRow[])
    .filter((r) => r.companies)
    .map((r) => ({
      slug: r.companies!.slug,
      display_name: r.companies!.display_name,
      searched_at: r.searched_at,
    }));

  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}

const postSchema = z.object({ slug: z.string().min(1) });

export async function POST(request: Request) {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ ok: true });
  }

  const supabase = client();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", body.slug)
    .maybeSingle();

  if (companyErr) {
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "company_not_found" }, { status: 404 });
  }

  const { error: upsertErr } = await supabase
    .from("search_history")
    .upsert(
      {
        user_id: userData.user.id,
        company_id: (company as { id: string }).id,
        searched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,company_id" }
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the search-history test until it passes**

Run:
```bash
npm test -- search-history-user-scoped
```
Expected: PASS all four cases.

- [ ] **Step 5: Write the companies/search test first**

Create `__tests__/companies-search-user-scoped.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: vi.fn(), getAll: () => [] }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    auth: { getUser: getUserMock },
    from: (...args: unknown[]) => fromMock(...args),
  }),
}));

import { GET } from "@/app/api/companies/search/route";

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("GET /api/companies/search", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request("https://app.test/api/companies/search?q=stri"));
    expect(res.status).toBe(401);
  });

  it("returns [] for queries shorter than 2 chars", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(new Request("https://app.test/api/companies/search?q=s"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("queries through search_history scoped to the authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });

    const limit = vi.fn().mockResolvedValue({
      data: [
        { companies: { slug: "stripe", display_name: "Stripe", domain: "stripe.com", logo_url: null, last_refreshed_at: null } },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const or = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ or });
    fromMock.mockReturnValue({ select });

    const res = await GET(new Request("https://app.test/api/companies/search?q=stri"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { slug: "stripe", display_name: "Stripe", domain: "stripe.com", logo_url: null, last_refreshed_at: null },
    ]);
    expect(fromMock).toHaveBeenCalledWith("search_history");
  });
});
```

- [ ] **Step 6: Run the test to confirm it fails**

Run:
```bash
npm test -- companies-search-user-scoped
```
Expected: FAIL — route still uses admin client.

- [ ] **Step 7: Rewrite `src/app/api/companies/search/route.ts`**

Replace the file contents:

```ts
// GET /api/companies/search — typeahead over this user's researched companies.
// Joins search_history → companies so only entries in the user's history
// surface. (RLS auto-scopes the search_history rows; the join filters the
// companies table accordingly.)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  companies: {
    slug: string;
    display_name: string;
    domain: string | null;
    logo_url: string | null;
    last_refreshed_at: string | null;
  } | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (process.env.MOCK_RESEARCH === "true") {
    const match =
      q.length >= 2 &&
      ("anthropic".includes(q.toLowerCase()) || q.toLowerCase().includes("anthropic"));
    return NextResponse.json(
      match
        ? [{ slug: "anthropic", display_name: "Anthropic", domain: "anthropic.com", logo_url: null, last_refreshed_at: new Date().toISOString() }]
        : [],
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = supabaseServer(cookies() as unknown as Parameters<typeof supabaseServer>[0]);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (q.length < 2) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  const { data, error } = await supabase
    .from("search_history")
    .select("companies!inner(slug, display_name, domain, logo_url, last_refreshed_at)")
    .or(`display_name.ilike.${pattern},slug.ilike.${pattern}`, { foreignTable: "companies" })
    .order("searched_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const out = ((data ?? []) as unknown as Row[])
    .map((r) => r.companies)
    .filter((c): c is NonNullable<Row["companies"]> => c !== null);

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 8: Run the test until it passes**

Run:
```bash
npm test -- companies-search-user-scoped
```
Expected: PASS all three cases.

- [ ] **Step 9: Write the research-route test first**

Create `__tests__/research-records-history.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: vi.fn(), getAll: () => [] }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "search_history") return { upsert: upsertMock };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

// Mock heavy deps so the route POST doesn't actually run sections.
vi.mock("@/lib/companies", () => ({
  findOrCreateCompany: vi.fn().mockResolvedValue({
    id: "co1",
    slug: "stripe",
    display_name: "Stripe",
    domain: "stripe.com",
    logo_url: null,
  }),
  touchLastRefreshed: vi.fn().mockResolvedValue(undefined),
  updateCompanyCanonical: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/disambiguate", () => ({
  disambiguateCompany: vi.fn().mockResolvedValue({
    canonical_name: "Stripe",
    canonical_domain: "stripe.com",
    one_line_description: "Payments.",
    disambiguation_note: null,
  }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    selectProvider: () => ({
      ok: true,
      config: { provider: "anthropic", searchBackend: "anthropic" },
    }),
    runResearchCall: vi.fn().mockResolvedValue({ data: { claims: [] }, modelVersion: "test", usage: null }),
  };
});

vi.mock("@/lib/sections/registry", () => ({ SECTIONS: [] }));

import { POST } from "@/app/api/research/route";

beforeEach(() => {
  getUserMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ error: null });
});

describe("POST /api/research auth + history", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new Request("https://app.test/api/research", {
      method: "POST",
      body: JSON.stringify({ name: "Stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts search_history after disambiguation when authenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = new Request("https://app.test/api/research", {
      method: "POST",
      headers: { "x-anthropic-key": "k" },
      body: JSON.stringify({ name: "Stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Consume the stream so the async pipeline runs to completion.
    const reader = res.body!.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toMatchObject({ user_id: "u1", company_id: "co1" });
    expect(opts).toEqual({ onConflict: "user_id,company_id" });
  });
});
```

- [ ] **Step 10: Run the test to confirm it fails**

Run:
```bash
npm test -- research-records-history
```
Expected: FAIL — the route doesn't currently check auth or record history.

- [ ] **Step 11: Modify `src/app/api/research/route.ts`** — add the auth gate and history upsert

Open `src/app/api/research/route.ts`. Make these edits:

(a) Add imports at the top (just below the existing imports — `disambiguateCompany` line is the last):

```ts
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
```

(b) Inside `POST`, right after the body-parse `try/catch` block (line ~57, just before `if (process.env.MOCK_RESEARCH === "true")`), insert:

```ts
  const supabaseUser = supabaseServer(cookies() as unknown as Parameters<typeof supabaseServer>[0]);
  const { data: userData } = await supabaseUser.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (!userId && process.env.MOCK_RESEARCH !== "true") {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
```

Mock mode bypass: in MOCK_RESEARCH frontend dev we may not have a session at all. Allow it.

(c) Inside the inner async pipeline, after the `updateCompanyCanonical(...)` call (line ~137, before `const companyInput: CompanyInput = { ... }`), insert:

```ts
        // Record the visit on the user's history. Idempotent via the
        // (user_id, company_id) unique index. Best-effort: a failure here
        // should not block the rest of the research stream.
        if (userId) {
          await supabaseUser
            .from("search_history")
            .upsert(
              {
                user_id: userId,
                company_id: company.id,
                searched_at: new Date().toISOString(),
              },
              { onConflict: "user_id,company_id" }
            )
            .then(({ error }) => {
              if (error) {
                console.error("[research] search_history upsert failed", error);
              }
            });
        }
```

- [ ] **Step 12: Run the research-route test until it passes**

Run:
```bash
npm test -- research-records-history
```
Expected: PASS both cases.

- [ ] **Step 13: Run the full test suite + build**

Run:
```bash
npm test && npm run build
```
Expected: every test file green (the new slice-4 tests + slice-3 tests + slice-1 untouched tests). Build clean.

If any earlier test broke, treat it as a regression and use `superpowers:systematic-debugging`.

- [ ] **Step 14: Commit**

```bash
git add src/app/api/search-history/route.ts src/app/api/companies/search/route.ts src/app/api/research/route.ts __tests__/search-history-user-scoped.test.ts __tests__/companies-search-user-scoped.test.ts __tests__/research-records-history.test.ts
git commit -m "feat(auth): user-scoped /api/search-history, /api/companies/search, /api/research"
```

---

## Slice 5 — Polished login page (frontend-design)

**Goal:** Replace the slice-3 placeholder with the real two-column login UI. Google OAuth button + email magic-link form, both routing through `/auth/callback`. Match the existing base-nova / serif aesthetic from `src/app/(home)` and `src/components`.

**Files:**
- Create: `src/app/login/login-form.tsx`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Invoke the `frontend-design:frontend-design` skill**

Hand the skill the brief below. **Do not improvise the UI without invoking the skill** — the user explicitly required it.

> "Build the FounderScope login form. Stack: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui (base-nova theme). Aesthetic should match `src/app/(home)` and `src/components/*` — refined serif headings (`var(--font-serif)`), muted body color (`var(--text-soft)` / `var(--text-quiet)`), Logomark from `@/components/logomark`. Two-column desktop, single-column mobile. Left column: Logomark + product name "FounderScope" in serif + one-line tagline. Right column: a card containing (1) a full-width 'Continue with Google' primary button using lucide-react's Google-ish icon (or inline SVG), (2) a horizontal divider with the label 'or' centered, (3) an email `<input>` + 'Send magic link' button. On magic-link submit, swap the form for a 'Check your inbox at <email>' panel with a 'use a different email' reset button. The component is a Client Component (uses `supabaseBrowser()` for `signInWithOAuth` + `signInWithOtp`). Read `?error=<code>` and `?next=<path>` from search params (props pass-through from the server component) — on error, show a banner above the card; on submit, pass `next` as `emailRedirectTo` and OAuth `redirectTo`."

Save the produced file at `src/app/login/login-form.tsx`. **Required wiring** (the skill may produce close-to-final code; ensure these specifics):

- Component declared `"use client"`.
- Props: `{ next: string; initialError?: string }`.
- Google handler:
  ```ts
  await supabaseBrowser().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  ```
- Magic-link handler:
  ```ts
  await supabaseBrowser().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  ```
- Error states from the OAuth/OTP responses surface inline (red text below the relevant button), separate from the URL `?error=<code>` banner.

If the skill's output diverges from these wiring requirements, hand-edit to conform.

- [ ] **Step 2: Update `src/app/login/page.tsx`** to render the new form

Replace the slice-3 body with:

```tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const supabase = supabaseServer(cookies() as unknown as Parameters<typeof supabaseServer>[0]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(searchParams.next ?? "/");
  }

  return <LoginForm next={searchParams.next ?? "/"} initialError={searchParams.error} />;
}
```

- [ ] **Step 3: Manual smoke check** (only if env vars + migration are in place — see slice 7 checklist)

If the user has set `NEXT_PUBLIC_SUPABASE_ANON_KEY` and run the migration:

```bash
npm run dev
```
Visit `http://localhost:3000/login`. Both the Google button and the magic-link form should render cleanly. Submitting an email triggers Supabase to send a magic link; the form swaps to the "check your inbox" panel.

If env vars aren't set yet, skip this step — automated tests + build cover code correctness, and the user runs full E2E in slice 7.

- [ ] **Step 4: Run tests and build**

Run:
```bash
npm test && npm run build
```
Expected: still green. No new test files in this slice (login UI is design-driven, not behavior-driven); existing tests should not regress.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/login-form.tsx src/app/login/page.tsx src/lib/supabase/browser.ts
git commit -m "feat(auth): login page UI (Google OAuth + email magic link)"
```

(Note: `browser.ts` was created in slice 1 but its first real consumer is this slice — confirm with `git status` that it isn't already committed; if it was committed in slice 1, omit it from the `git add` line.)

---

## Slice 6 — Sidebar user badge

**Goal:** Surface the signed-in user in the sidebar footer: avatar + email + sign-out. Avatar from Google `user_metadata.avatar_url` if present; initials block fallback styled like `<CompanyLogo>`.

**Files:**
- Create: `src/components/user-badge.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Create `src/components/user-badge.tsx`**

```tsx
"use client";
// Sidebar footer user row. Renders a skeleton until the browser client
// resolves the current user; this avoids hydration flicker because the
// initial server render has no access to the cookie-derived avatar URL.
import { useEffect, useState } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function UserBadge() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [user, setUser] = useState<User | null | "loading">("loading");

  useEffect(() => {
    let mounted = true;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (mounted) setUser(data.user ?? null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  };

  if (user === "loading") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton aria-label="Loading user">
            <span
              className="inline-block rounded-full bg-[color:var(--surface-2,#eee)]"
              style={{ width: 20, height: 20 }}
            />
            {!collapsed && (
              <span
                className="inline-block rounded bg-[color:var(--surface-2,#eee)]"
                style={{ height: 12, width: 96 }}
              />
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!user) return null;

  const avatarUrl =
    (user.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ?? null;
  const email = user.email ?? "Signed in";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={collapsed ? signOut : undefined}
          tooltip={collapsed ? "Sign out" : email}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={20}
              height={20}
              className="rounded-full"
              unoptimized
            />
          ) : (
            <span
              className="inline-flex items-center justify-center rounded-full font-mono"
              style={{
                width: 20,
                height: 20,
                fontSize: 9,
                background: "var(--surface-2, #eee)",
                color: "var(--text-soft, #555)",
              }}
            >
              {initials}
            </span>
          )}
          {!collapsed && (
            <>
              <span
                className="serif truncate"
                style={{ flex: 1, fontSize: 13, color: "var(--text-soft)" }}
              >
                {email}
              </span>
              <button
                onClick={signOut}
                aria-label="Sign out"
                style={{ color: "var(--text-quiet)" }}
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

`Image` from `next/image` requires the `images.remotePatterns` config for Google avatar hosts (`*.googleusercontent.com`). To avoid the build pulling in `next.config.js` work in this slice, the component uses `unoptimized` on the avatar `<Image>`. If you'd rather use a plain `<img>`, replace with:
```tsx
<img src={avatarUrl} alt="" width={20} height={20} className="rounded-full" />
```
and drop the `import Image from "next/image"`.

- [ ] **Step 2: Wire `<UserBadge />` into `src/components/app-sidebar.tsx`**

Find the existing `<SidebarFooter>` block (line 170). Insert `<UserBadge />` as the first child, before the existing `<SidebarMenu>` containing the Settings link.

Add the import near the top of the file alongside the other component imports:

```ts
import { UserBadge } from "./user-badge";
```

Updated footer block:

```tsx
      <SidebarFooter>
        <UserBadge />
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/settings">
              <SidebarMenuButton isActive={isSettings} tooltip="Settings">
                <Settings />
                {!collapsed && <span>Settings</span>}
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* ... existing version + cache-fresh row stays unchanged ... */}
      </SidebarFooter>
```

- [ ] **Step 3: Run tests and build**

Run:
```bash
npm test && npm run build
```
Expected: still green. If build complains about the `Image` import or `next/image`, swap to the plain `<img>` fallback noted above.

- [ ] **Step 4: Commit**

```bash
git add src/components/user-badge.tsx src/components/app-sidebar.tsx
git commit -m "feat(sidebar): user badge with avatar + sign-out"
```

---

## Slice 7 — Env docs finalization + manual-test checklist

**Goal:** Land a complete `.env.local.example` and a manual E2E checklist for the user. No code changes beyond docs.

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Polish `.env.local.example`** — ensure the auth-relevant block is documented

The file should now read (replace the Supabase block; leave the rest untouched):

```dotenv
# Supabase — create a project at supabase.com, find these in Settings > API.
# Both server (Route Handlers, middleware) and browser (Client Components)
# use NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY through @supabase/ssr.
# SUPABASE_SERVICE_ROLE_KEY stays server-only and powers the admin client
# (companies, reports, exa_search_cache).
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Google OAuth credentials are configured in the Supabase dashboard
# (Auth > Providers > Google), not via env vars.
```

- [ ] **Step 2: Run tests and build**

Run:
```bash
npm test && npm run build
```
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "docs(env): document NEXT_PUBLIC_SUPABASE_ANON_KEY for SSR auth"
```

- [ ] **Step 4: Print the manual-test checklist for the user**

Output (verbatim) to the user once all slices are merged:

```
Before manual testing, do these in order:

1. Apply the migration:
   supabase db push
   (or paste supabase/migrations/0003_auth_and_user_history.sql into the Supabase SQL editor)

2. Add to .env.local:
   NEXT_PUBLIC_SUPABASE_URL=<from Settings > API>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Settings > API>
   (rename existing SUPABASE_URL if present)

3. Add the same NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel project env (Preview + Production).

4. In Supabase Dashboard > Authentication > Providers:
   - Enable Email (magic link). Default works.
   - Enable Google. Add OAuth client ID + secret from Google Cloud Console.

5. In Supabase Dashboard > Authentication > URL Configuration:
   - Site URL: https://<your-vercel-domain>
   - Additional Redirect URLs (add all):
       http://localhost:3000/auth/callback
       https://<your-vercel-preview-domain>/auth/callback
       https://<your-vercel-prod-domain>/auth/callback

Manual E2E checklist:
[ ] Visit / while logged out → redirected to /login.
[ ] /login renders the two-column form.
[ ] Google sign-in → /auth/callback → / loads with sidebar showing your email + avatar.
[ ] Magic link: enter email → "check your inbox" panel → click link in email → /auth/callback → /.
[ ] Sidebar "Recently researched" is empty for a fresh user.
[ ] ⌘K → type "Stripe" → no matches → "Research Stripe" CTA.
[ ] Run the research → after disambig, Stripe appears in sidebar.
[ ] Sign out → / redirects to /login.
[ ] Sign in as a different user → sidebar empty (proves user-isolation).
[ ] Research Stripe again → cached, instant; this user's sidebar gets Stripe; original user's sidebar still has Stripe.
```

---

## Final wrap-up (after all slices)

- [ ] **Step 1: Confirm a clean working tree**

```bash
git status
git log --oneline phase-3/foundation-slice...HEAD | head -20
```
Expected: working tree clean. 7 new commits on the branch (one per slice).

- [ ] **Step 2: Run the full suite + build one more time**

```bash
npm test && npm run build
```
Expected: green. Paste the tails to the user as proof.

- [ ] **Step 3: Write a PR-style summary** for the user

Draft:

```
Branch: phase-3/foundation-slice
Commits: 7 (one per slice — see git log).

## Summary
- Adds required Supabase Auth gate (Google OAuth + email magic link) on every route.
- Scopes search_history per user via RLS + composite (user_id, company_id) unique index.
- Splits the supabase client into admin/server/middleware/browser via @supabase/ssr.
- Existing cross-user caches (companies, reports, exa_search_cache) stay shared.

## Required user actions before deploy
1. Apply migration 0003_auth_and_user_history.sql (`supabase db push` or SQL editor).
2. Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local + Vercel.
3. Enable Google + magic-link providers in Supabase dashboard; whitelist callback URLs.

## Test plan
- [ ] npm test green (28 files including 5 new auth tests)
- [ ] npm run build green
- [ ] Manual E2E: see checklist in slice 7
```

- [ ] **Step 4: Ask the user to push**

Stop. Do not push. Surface the summary and ask the user to push manually.
