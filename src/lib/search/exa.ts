import { consumeSearchBudget } from "./budget";
import {
  cacheKeyFor,
  readSearchCache,
  writeSearchCache,
  type SearchResponse,
} from "./cache";
import { exaSearch } from "./exa-client";
import { sourceFallback, SOURCE_FALLBACK_THRESHOLD } from "./source-fallback";
import { toSearchRequest } from "./request";
import {
  isExaRateLimitError,
  withExaRetry,
} from "./with-exa-retry";
import type { SearchOptions, SearchProvider, SearchResult } from "./types";

export function createExaProvider(apiKey: string): SearchProvider {
  return {
    id: "exa",
    async search(
      query: string,
      opts: SearchOptions,
    ): Promise<SearchResult[]> {
      consumeSearchBudget("exa", opts.budget);
      const search = toSearchRequest(query, opts);
      const primaryKey = cacheKeyFor(search);
      const cached = await readSearchCache(primaryKey);
      if (cached) {
        if (opts.usage) opts.usage.cacheHits++;
        return cached.results;
      }

      try {
        let results = await withExaRetry(() => exaSearch(search, apiKey));
        if (opts.usage) opts.usage.calls++;

        if (results.length < SOURCE_FALLBACK_THRESHOLD) {
          const fallback = sourceFallback(search);
          const fallbackKey = cacheKeyFor(fallback);
          const fallbackCached = await readSearchCache(fallbackKey);
          let fallbackResults: SearchResult[];
          if (fallbackCached) {
            fallbackResults = fallbackCached.results;
            if (opts.usage) opts.usage.cacheHits++;
          } else {
            try {
              fallbackResults = await withExaRetry(() =>
                exaSearch(fallback, apiKey),
              );
              if (opts.usage) opts.usage.calls++;
              await writeSearchCache(fallbackKey, fallback.query, {
                results: fallbackResults,
              });
            } catch (error) {
              if (isExaRateLimitError(error) && opts.usage) {
                opts.usage.rateLimit429s++;
              }
              fallbackResults = [];
            }
          }
          if (fallbackResults.length > 0) {
            if (opts.usage) opts.usage.fallbackHits++;
            results = mergeUniqueByUrl(results, fallbackResults);
          }
        }

        const output: SearchResponse = { results };
        await writeSearchCache(primaryKey, search.query, output);
        return results;
      } catch (error) {
        if (isExaRateLimitError(error) && opts.usage) {
          opts.usage.rateLimit429s++;
        }
        throw error;
      }
    },
  };
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
