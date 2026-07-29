import type { Citation } from "@/lib/sections/types";

export type CompanyMaturity = "early-stage" | "enterprise";

export interface GoldenCompany {
  name: string;
  domain: string;
  maturity: CompanyMaturity;
}

export interface SectionEvalResult {
  sectionKey: string;
  content: unknown;
  citations: Citation[];
}

/** Output shape produced by a full research eval run (one company). */
export interface ResearchEvalOutput {
  company: GoldenCompany;
  sections: SectionEvalResult[];
}

export interface ClaimCounts {
  totalClaims: number;
  citedClaims: number;
}

export interface ScorerMetrics {
  schemaPass: number;
  citationFillRate: number | null;
  deadLinkRate: number | null;
  domainAdherence: number | null;
}
