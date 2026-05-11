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
