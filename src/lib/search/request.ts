import type { SearchOptions } from "./types";

export interface SearchRequest {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  livecrawl?: "always" | "fallback" | "never";
}

export function toSearchRequest(
  query: string,
  opts: SearchOptions,
): SearchRequest {
  return {
    query,
    numResults: opts.numResults,
    includeDomains: opts.includeDomains,
    excludeDomains: opts.excludeDomains,
    startPublishedDate: opts.startPublishedDate,
    livecrawl: opts.livecrawl,
  };
}
