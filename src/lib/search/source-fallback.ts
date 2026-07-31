import type { SearchRequest } from "./request";

export const FALLBACK_DOMAINS: ReadonlyArray<string> = [
  "ycombinator.com",
  "wellfound.com",
  "linkedin.com",
  "github.com",
  "sec.gov",
  "crunchbase.com",
];

/**
 * Thin-result retry shape. When the primary request already carried a section
 * allowlist, drop includeDomains entirely so the retry searches the open web —
 * allowlists are a bias, not a hard filter. Requests that arrived without
 * includeDomains keep the generic FALLBACK_DOMAINS behaviour.
 */
export function sourceFallback(original: SearchRequest): SearchRequest {
  if (original.includeDomains?.length) {
    const widened: SearchRequest = { ...original };
    delete widened.includeDomains;
    return widened;
  }
  return {
    ...original,
    includeDomains: [...FALLBACK_DOMAINS],
  };
}

export const SOURCE_FALLBACK_THRESHOLD = 3;

/**
 * How thin a result set must be before buying a second search.
 *
 * An ungrounded query returning 2 of a requested 5 results is genuinely weak, so
 * the generic threshold of 3 is right there. A *grounded* query is different: it
 * asked for a narrow slice of the web on purpose, so 2 on-allowlist results is a
 * success, not a failure. Applying the same threshold to both would buy an
 * open-web retry on nearly every grounded search — EXA returns 5 by default, and
 * a 4-to-11 entry allowlist routinely trims that below 3. With the fallback now
 * correctly debited, that does not overspend; it spends the section's cap on
 * near-empty probes and exhausts the budget at roughly half the distinct queries.
 *
 * So a grounded search only falls back when it found *nothing at all*, which is
 * the case the "bias, not a hard filter" rule actually exists to cover.
 */
export function fallbackThresholdFor(request: SearchRequest): number {
  const grounded = (request.includeDomains?.length ?? 0) > 0;
  return grounded ? 1 : SOURCE_FALLBACK_THRESHOLD;
}
