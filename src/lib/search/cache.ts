import { z } from "zod";
import { supabaseAdmin as supabase } from "../supabase/admin";
import type { SearchRequest } from "./request";
import type { SearchResult } from "./types";

const DEFAULT_TTL_DAYS = 7;
const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const FNV_MASK = BigInt("0xffffffffffffffff");

const cachedSearchSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      highlights: z.array(z.string()),
    }),
  ),
});

export interface SearchResponse {
  results: SearchResult[];
}

function fnv1a64Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hash = FNV_OFFSET;
  for (let index = 0; index < bytes.length; index++) {
    hash ^= BigInt(bytes[index]);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export function cacheKeyFor(input: SearchRequest): string {
  const parts = {
    q: (input.query ?? "").trim().toLowerCase(),
    n: input.numResults ?? 5,
    inc: [...(input.includeDomains ?? [])]
      .map((domain) => domain.toLowerCase())
      .sort(),
    exc: [...(input.excludeDomains ?? [])]
      .map((domain) => domain.toLowerCase())
      .sort(),
    spd: input.startPublishedDate ?? null,
    lc: input.livecrawl ?? null,
  };
  return fnv1a64Hex(JSON.stringify(parts));
}

export async function readSearchCache(
  key: string,
): Promise<SearchResponse | null> {
  try {
    const { data, error } = await supabase
      .from("exa_search_cache")
      .select("results_json, expires_at")
      .eq("query_hash", key)
      .maybeSingle();
    if (error || !data) return null;

    const row = data as { results_json: unknown; expires_at: string };
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    const parsed = cachedSearchSchema.safeParse(row.results_json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeSearchCache(
  key: string,
  query: string,
  results: SearchResponse,
  ttlDays: number = DEFAULT_TTL_DAYS,
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + ttlDays * 86_400_000,
  ).toISOString();
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
    // Cache writes are best-effort and must never break a search.
  }
}
