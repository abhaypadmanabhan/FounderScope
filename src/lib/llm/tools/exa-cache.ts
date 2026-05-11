// Exa search-result cache. Sits in front of `exaSearch` (api.exa.ai) so
// identical / near-identical queries across parallel sections and repeat
// company reports don't burn monthly quota.
//
// Key = sha256(normalized_query | numResults | sorted includeDomains |
//              sorted excludeDomains | startPublishedDate | livecrawl).
//
// All Supabase ops are best-effort: a cache miss is the safe default, so any
// transport / schema / RLS failure returns null (read) or silently drops
// (write). The hot path must never fail because the cache is unavailable.
import { createHash } from "node:crypto";
import { supabase } from "../../supabase";
import type { ExaSearchInput, ExaSearchOutput } from "./exa-client";

const DEFAULT_TTL_DAYS = 7;

export function cacheKeyFor(input: ExaSearchInput): string {
  const parts = {
    q: (input.query ?? "").trim().toLowerCase(),
    n: input.numResults ?? 5,
    inc: [...(input.includeDomains ?? [])].map((d) => d.toLowerCase()).sort(),
    exc: [...(input.excludeDomains ?? [])].map((d) => d.toLowerCase()).sort(),
    spd: input.startPublishedDate ?? null,
    lc: input.livecrawl ?? null,
  };
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export async function readExaCache(
  key: string,
): Promise<ExaSearchOutput | null> {
  try {
    const { data, error } = await supabase
      .from("exa_search_cache")
      .select("results_json, expires_at")
      .eq("query_hash", key)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { results_json: ExaSearchOutput; expires_at: string };
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    return row.results_json;
  } catch {
    return null;
  }
}

export async function writeExaCache(
  key: string,
  query: string,
  results: ExaSearchOutput,
  ttlDays: number = DEFAULT_TTL_DAYS,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  try {
    await supabase.from("exa_search_cache").upsert(
      {
        query_hash: key,
        query_text: query,
        results_json: results,
        expires_at: expiresAt,
      },
      { onConflict: "query_hash" },
    );
  } catch {
    // swallow — cache write must never break the request
  }
}
