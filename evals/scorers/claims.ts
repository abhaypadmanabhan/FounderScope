import { extractCitations } from "@/lib/sections/shared";
import type { ClaimCounts } from "../types";

/** Mirrors route.ts callAndValidate claim counting for citation fill-rate. */
export function countClaims(content: unknown): ClaimCounts {
  const dataClaims =
    content && typeof content === "object" && "claims" in content
      ? (content as { claims?: unknown[] }).claims
      : undefined;

  const totalClaims = Array.isArray(dataClaims) ? dataClaims.length : 0;
  const citedClaims = extractCitations(content).length;

  return { totalClaims, citedClaims };
}

export function aggregateClaimCounts(
  sections: Array<{ content: unknown }>
): ClaimCounts {
  return sections.reduce<ClaimCounts>(
    (acc, section) => {
      const counts = countClaims(section.content);
      return {
        totalClaims: acc.totalClaims + counts.totalClaims,
        citedClaims: acc.citedClaims + counts.citedClaims,
      };
    },
    { totalClaims: 0, citedClaims: 0 }
  );
}

export function citationFillRate(counts: ClaimCounts): number | null {
  if (counts.totalClaims === 0) return null;
  return counts.citedClaims / counts.totalClaims;
}
