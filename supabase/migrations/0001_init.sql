-- Initial schema: companies, reports, search_history tables.
-- Run via: supabase db push or paste into the Supabase SQL editor.

create extension if not exists "uuid-ossp";

create table companies (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,
  display_name    text not null,
  domain          text,
  logo_url        text,
  search_tokens   text[],
  created_at      timestamptz not null default now(),
  last_refreshed_at timestamptz,
  refresh_count   int not null default 0
);

-- GIN index for fast full-text/array search on company tokens
create index companies_search_tokens_gin on companies using gin(search_tokens);

create table reports (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references companies(id) on delete cascade,
  section_key     text not null,
  schema_version  int not null,
  content_json    jsonb not null,
  citations_json  jsonb not null default '[]',
  generated_at    timestamptz not null default now(),
  model_version   text not null
);

-- Enforce one row per company+section; upsert targets this constraint
create unique index reports_company_section_unique on reports(company_id, section_key);

create table search_history (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references companies(id) on delete cascade,
  searched_at     timestamptz not null default now()
);
