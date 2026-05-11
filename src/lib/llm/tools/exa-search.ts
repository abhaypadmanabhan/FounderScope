// Custom function tool the model invokes inside the tool-use loop. The handler
// catches EXA failures and returns a stringified error blob so the model can
// decide whether to retry with a different query rather than crashing the section.
//
// Layering inside handleExaSearch (top to bottom):
//   1. Supabase exa_search_cache lookup (7-day TTL) — best-effort, never throws.
//   2. Live exaSearch() wrapped in withExaRetry (429 / 5xx backoff).
//   3. Single-tier source-fallback: re-query with canonical early-stage
//      includeDomains when the first response yields <3 hits.
//   4. Cache write of the final (possibly merged) results.
//
// All counters mutate an optional ExaUsage instance passed from the caller.
// route.ts aggregates per-section usage into a final `exa_usage` SSE event.
import { exaSearch, type ExaSearchInput, type ExaSearchOutput } from "./exa-client";
import { cacheKeyFor, readExaCache, writeExaCache } from "./exa-cache";
import { withExaRetry, isExaRateLimitError } from "./with-exa-retry";
import { sourceFallback, SOURCE_FALLBACK_THRESHOLD } from "./source-fallback";

export interface ExaUsage {
  calls: number;
  cacheHits: number;
  rateLimit429s: number;
  fallbackHits: number;
}

export function createExaUsage(): ExaUsage {
  return { calls: 0, cacheHits: 0, rateLimit429s: 0, fallbackHits: 0 };
}

export function mergeExaUsage(into: ExaUsage, from: ExaUsage): ExaUsage {
  into.calls += from.calls;
  into.cacheHits += from.cacheHits;
  into.rateLimit429s += from.rateLimit429s;
  into.fallbackHits += from.fallbackHits;
  return into;
}

export const EXA_SEARCH_TOOL = {
  type: "custom" as const,
  name: "exa_search",
  description:
    "Search the public web. Returns a list of {title, url, highlights} hits. " +
    "Use for company facts, founder bios, funding rounds, news. " +
    "When you cite a fact in your output's `claims`, use the URL from these results. " +
    "Budget: aim for 3-5 searches per task. Quality matters more than quantity. " +
    "After gathering enough information, stop searching and write the final JSON answer.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const },
      num_results: { type: "integer" as const, default: 5, minimum: 1, maximum: 10 },
    },
    required: ["query"] as const,
  },
};

/**
 * OpenAI-compat tool definition for the Kimi adapter. Same name + schema as
 * EXA_SEARCH_TOOL so the rest of the code path (handleExaSearch) stays shared.
 */
export function openaiExaToolDef() {
  return {
    type: "function" as const,
    function: {
      name: EXA_SEARCH_TOOL.name,
      description: EXA_SEARCH_TOOL.description,
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const },
          num_results: {
            type: "integer" as const,
            default: 5,
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["query"] as const,
        additionalProperties: false,
      },
    },
  };
}

export async function handleExaSearch(
  input: { query: string; num_results?: number },
  exaKey: string,
  usage?: ExaUsage,
): Promise<string> {
  const search: ExaSearchInput = {
    query: input.query,
    numResults: input.num_results,
  };

  const primaryKey = cacheKeyFor(search);
  const cached = await readExaCache(primaryKey);
  if (cached) {
    if (usage) usage.cacheHits++;
    return JSON.stringify(cached);
  }

  try {
    let out = await withExaRetry(() => exaSearch(search, exaKey));
    if (usage) usage.calls++;

    if (out.results.length < SOURCE_FALLBACK_THRESHOLD) {
      const fallback = sourceFallback(search);
      const fallbackKey = cacheKeyFor(fallback);
      const fallbackCached = await readExaCache(fallbackKey);
      let fallbackOut: ExaSearchOutput;
      if (fallbackCached) {
        fallbackOut = fallbackCached;
        if (usage) usage.cacheHits++;
      } else {
        try {
          fallbackOut = await withExaRetry(() => exaSearch(fallback, exaKey));
          if (usage) usage.calls++;
          await writeExaCache(fallbackKey, fallback.query, fallbackOut);
        } catch (err) {
          if (isExaRateLimitError(err) && usage) usage.rateLimit429s++;
          fallbackOut = { results: [] };
        }
      }
      if (fallbackOut.results.length > 0) {
        if (usage) usage.fallbackHits++;
        out = mergeUniqueByUrl(out, fallbackOut);
      }
    }

    await writeExaCache(primaryKey, search.query, out);
    return JSON.stringify(out);
  } catch (err) {
    if (isExaRateLimitError(err) && usage) usage.rateLimit429s++;
    return JSON.stringify({
      error: (err as Error).message ?? "EXA call failed",
      results: [],
    });
  }
}

function mergeUniqueByUrl(
  primary: ExaSearchOutput,
  fallback: ExaSearchOutput,
): ExaSearchOutput {
  const seen = new Set(primary.results.map((r) => r.url));
  const merged = [...primary.results];
  for (const r of fallback.results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    merged.push(r);
  }
  return { results: merged };
}
