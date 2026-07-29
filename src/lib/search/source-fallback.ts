import type { SearchRequest } from "./request";

export const FALLBACK_DOMAINS: ReadonlyArray<string> = [
  "ycombinator.com",
  "wellfound.com",
  "linkedin.com",
  "github.com",
  "sec.gov",
  "crunchbase.com",
];

export function sourceFallback(original: SearchRequest): SearchRequest {
  return {
    ...original,
    includeDomains: [...FALLBACK_DOMAINS],
  };
}

export const SOURCE_FALLBACK_THRESHOLD = 3;
