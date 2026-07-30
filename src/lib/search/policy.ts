import { consumeSearchBudget } from "./budget";
import {
  cacheKeyFor,
  readSearchCache,
  writeSearchCache,
  type SearchResponse,
} from "./cache";
import { toSearchRequest, type SearchRequest } from "./request";
import { fallbackThresholdFor, sourceFallback } from "./source-fallback";
import {
  isSearchRateLimitError,
  withSearchRetry,
} from "./with-exa-retry";
import type {
  RawSearchProvider,
  SearchOptions,
  SearchProvider,
  SearchResult,
} from "./types";

/**
 * A caller reached the policy wrapper without the budget `SearchOptions`
 * requires. That is a wiring mistake, not a search failure, and it used to
 * surface as `TypeError: Cannot read properties of undefined (reading 'used')`
 * from inside `consumeSearchBudget` — an unattributable message thrown deep in
 * a tool callback, where the model's only response is to retry until its step
 * budget is gone.
 */
export class SearchMisconfiguredError extends Error {
  readonly code = "search_misconfigured";

  constructor(message: string) {
    super(message);
    this.name = "SearchMisconfiguredError";
  }
}

export function withSearchPolicy(
  backend: RawSearchProvider,
): SearchProvider {
  return {
    id: backend.id,
    async search(
      query: string,
      opts: SearchOptions,
    ): Promise<SearchResult[]> {
      // `SearchOptions.budget` is required, so this cannot happen through a
      // typechecked call site. It guards the untyped ones — a JS caller, a
      // hand-built options object, a test harness — and names itself when it
      // does, instead of dying on a property read three frames down.
      if (opts?.budget == null) {
        throw new SearchMisconfiguredError(
          `${backend.id} search called without a SearchBudget. ` +
            "Create one per model call with createSearchBudget(tier) and pass it in SearchOptions.",
        );
      }
      consumeSearchBudget(backend.id, opts.budget);
      const primary = toSearchRequest(query, opts);
      const primaryKey = cacheKeyFor(primary, backend.id);
      const cached = await readSearchCache(primaryKey);
      if (cached) {
        if (opts.usage) opts.usage.cacheHits++;
        return cached.results;
      }

      // NOTE: the primary debit above happens before the cache read, so a cache
      // hit still costs a slot. That asymmetry with the fallback debit below is
      // real and is recorded in tasks/todo.md as a deliberately deferred product
      // decision — the cap currently means "searches attempted", not "searches
      // billed". Changing it is a product call, not a cleanup, and two tests
      // encode the current contract on purpose.
      try {
        let results = await runLive(backend, primary, opts);
        if (results.length < fallbackThresholdFor(primary)) {
          results = await mergeSourceFallback(backend, primary, results, opts);
        }

        const output: SearchResponse = { results };
        await writeSearchCache(primaryKey, primary.query, output);
        return results;
      } catch (error) {
        if (isSearchRateLimitError(backend.id, error) && opts.usage) {
          opts.usage.rateLimit429s++;
        }
        throw error;
      }
    },
  };
}

async function runLive(
  backend: RawSearchProvider,
  request: SearchRequest,
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const results = await withSearchRetry(backend.id, () =>
    backend.search(request.query, request),
  );
  if (opts.usage) opts.usage.calls++;
  return results;
}

async function mergeSourceFallback(
  backend: RawSearchProvider,
  primary: SearchRequest,
  primaryResults: SearchResult[],
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const fallback = sourceFallback(primary);
  const fallbackKey = cacheKeyFor(fallback, backend.id);
  const cached = await readSearchCache(fallbackKey);
  let fallbackResults: SearchResult[];
  if (cached) {
    fallbackResults = cached.results;
    if (opts.usage) opts.usage.cacheHits++;
  } else {
    try {
      // The fallback is a second live, billed search. It used to run undebited,
      // so a section could bill twice its advertised cap. Grounding makes that
      // routine rather than rare: a per-section allowlist narrows results, so
      // `length < SOURCE_FALLBACK_THRESHOLD` now holds on most sections instead
      // of occasionally. Debiting here means an exhausted budget throws, the
      // catch below degrades to the primary results, and the cap is real.
      consumeSearchBudget(backend.id, opts.budget);
      fallbackResults = await runLive(backend, fallback, opts);
      await writeSearchCache(fallbackKey, fallback.query, {
        results: fallbackResults,
      });
    } catch (error) {
      if (isSearchRateLimitError(backend.id, error) && opts.usage) {
        opts.usage.rateLimit429s++;
      }
      fallbackResults = [];
    }
  }

  if (fallbackResults.length === 0) return primaryResults;
  if (opts.usage) opts.usage.fallbackHits++;
  return mergeUniqueByUrl(primaryResults, fallbackResults);
}

function mergeUniqueByUrl(
  primary: SearchResult[],
  fallback: SearchResult[],
): SearchResult[] {
  const seen = new Set(primary.map((result) => result.url));
  const merged = [...primary];
  for (const result of fallback) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    merged.push(result);
  }
  return merged;
}
