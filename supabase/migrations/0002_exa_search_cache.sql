-- Exa search-result cache. Stores raw Exa responses keyed by a stable hash
-- of (query + numResults + filter params) so identical or near-identical
-- searches across sections / repeat reports skip the API.
-- TTL enforced on read (expires_at > now()); cleanup job optional.

create table exa_search_cache (
  query_hash    text primary key,
  query_text    text not null,
  results_json  jsonb not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index exa_search_cache_expires_idx on exa_search_cache(expires_at);
