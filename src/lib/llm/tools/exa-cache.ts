// Exa search-result cache. Sits in front of `exaSearch` (api.exa.ai) so
// identical / near-identical queries across parallel sections and repeat
// company reports don't burn monthly quota.
//
// Key = fnv1a64(normalized_query | numResults | sorted includeDomains |
//               sorted excludeDomains | startPublishedDate | livecrawl).
// We use FNV-1a (pure JS, no imports) rather than node:crypto so the module
// is bundle-safe — @/lib/llm/index re-exports flow into the settings page
// client bundle and webpack's browser target cannot resolve `node:*` URIs.
// Cryptographic strength is not required: keys are internal cache lookups,
// never exposed, and the 64-bit space makes collisions negligible.
//
// All Supabase ops are best-effort: a cache miss is the safe default, so any
// transport / schema / RLS failure returns null (read) or silently drops
// (write). The hot path must never fail because the cache is unavailable.
import { supabase } from "../../supabase";
import type { ExaSearchInput, ExaSearchOutput } from "./exa-client";

const DEFAULT_TTL_DAYS = 7;

// BigInt literal syntax (`0n`) requires tsconfig target ES2020+. Using the
// BigInt() constructor with hex strings keeps the existing target untouched.
const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const FNV_MASK = BigInt("0xffffffffffffffff");

function fnv1a64Hex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * FNV_PRIME) & FNV_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

export function cacheKeyFor(input: ExaSearchInput): string {
  const parts = {
    q: (input.query ?? "").trim().toLowerCase(),
    n: input.numResults ?? 5,
    inc: [...(input.includeDomains ?? [])].map((d) => d.toLowerCase()).sort(),
    exc: [...(input.excludeDomains ?? [])].map((d) => d.toLowerCase()).sort(),
    spd: input.startPublishedDate ?? null,
    lc: input.livecrawl ?? null,
  };
  return fnv1a64Hex(JSON.stringify(parts));
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
