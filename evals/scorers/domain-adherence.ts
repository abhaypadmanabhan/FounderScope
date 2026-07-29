import type { Citation } from "@/lib/sections/types";
import { allowlistForSection, urlMatchesAllowlist } from "../domains";
import type { CompanyMaturity, ResearchEvalOutput } from "../types";

/** Fraction of citations whose URL falls inside the section allowlist (0–1). */
export function domainAdherenceForSection(
  sectionKey: string,
  maturity: CompanyMaturity,
  citations: Citation[]
): number | null {
  if (citations.length === 0) return null;

  const allowlist = allowlistForSection(sectionKey, maturity);
  const inAllowlist = citations.filter((c) =>
    urlMatchesAllowlist(c.url, allowlist)
  ).length;

  return inAllowlist / citations.length;
}

export function aggregateDomainAdherence(
  output: ResearchEvalOutput
): number | null {
  const rates: number[] = [];

  for (const section of output.sections) {
    const rate = domainAdherenceForSection(
      section.sectionKey,
      output.company.maturity,
      section.citations
    );
    if (rate !== null) rates.push(rate);
  }

  if (rates.length === 0) return null;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}
