// Single-tier source fallback. When a fresh Exa search returns <3 results
// (rare for mature companies, common for sub-12-month-old startups whose
// names don't yet rank globally), re-issue the same query but bias toward
// canonical early-stage sources via includeDomains.
//
// Pure function — handleExaSearch decides whether to call it.
import type { ExaSearchInput } from "./exa-client";

export const FALLBACK_DOMAINS: ReadonlyArray<string> = [
  "ycombinator.com",
  "wellfound.com",
  "linkedin.com",
  "github.com",
  "sec.gov",
  "crunchbase.com",
];

export function sourceFallback(original: ExaSearchInput): ExaSearchInput {
  return {
    ...original,
    includeDomains: [...FALLBACK_DOMAINS],
  };
}

export const SOURCE_FALLBACK_THRESHOLD = 3;
