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

/** Global fraction of all citations inside their section allowlist (weighted by count). */
export function aggregateDomainAdherence(
  output: ResearchEvalOutput
): number | null {
  let total = 0;
  let inAllowlist = 0;

  for (const section of output.sections) {
    const allowlist = allowlistForSection(
      section.sectionKey,
      output.company.maturity
    );
    for (const citation of section.citations) {
      total++;
      if (urlMatchesAllowlist(citation.url, allowlist)) {
        inAllowlist++;
      }
    }
  }

  if (total === 0) return null;
  return inAllowlist / total;
}
