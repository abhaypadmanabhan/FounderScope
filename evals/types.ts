import type { Citation } from "@/lib/sections/types";

export type CompanyMaturity = "early-stage" | "enterprise";

export interface GoldenCompany {
  name: string;
  domain: string;
  maturity: CompanyMaturity;
}

/** Where a ground-truth value came from. Primary = the company itself or a regulator. */
export type SourceTier = "primary" | "secondary";

/**
 * One ground-truth value with the evidence that backs it. Nothing enters the
 * expected set without a URL a human can re-open, because the set is curated by
 * an LLM reading the web and an unsourced value is indistinguishable from a
 * guess.
 */
export interface SourcedFact<T> {
  value: T;
  /** URL the value was read from. */
  source: string;
  /** ISO date (YYYY-MM-DD) the value was verified against that URL. */
  asOf: string;
  tier: SourceTier;
}

export interface FundingFact {
  /** "Seed", "Series B", "IPO", "Acquired" — as the source words it. */
  stage: string;
  /** Round size in USD. Null when the source discloses a stage but no amount. */
  amountUsd: number | null;
  /**
   * ISO date the round was announced. Optional, and not graded — a company blog
   * post routinely states the stage and the amount without a machine-readable
   * date, and inventing one to satisfy the type is exactly the guess this whole
   * structure exists to prevent.
   */
  announced?: string;
  leadInvestor: string | null;
}

/** Headcount as a band, never a point estimate — exact counts go stale weekly. */
export interface EmployeeBand {
  min: number;
  /** Null means open-ended, e.g. 10000+. */
  max: number | null;
}

export interface TickerFact {
  symbol: string;
  /** Exchange MIC or common short name, e.g. "NASDAQ". */
  exchange: string;
}

/**
 * Ground truth for one golden-set company.
 *
 * Every field is optional and an absent field is NOT graded. That asymmetry is
 * the whole safety property: a fact that could not be pinned to a source is
 * omitted rather than guessed, so a soft label can never quietly become a wrong
 * grade against the product.
 */
export interface ExpectedFacts {
  foundedYear?: SourcedFact<number>;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  hqCountry?: SourcedFact<string>;
  latestFunding?: SourcedFact<FundingFact>;
  employees?: SourcedFact<EmployeeBand>;
  ticker?: SourcedFact<TickerFact>;
}

/** Keyed by GoldenCompany.domain. */
export type GroundTruth = Record<string, ExpectedFacts>;

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
  factualAccuracy: number | null;
}

export interface FactualAccuracyResult {
  score: number | null;
  gradedFields: Array<keyof ExpectedFacts>;
  fieldScores: Partial<Record<keyof ExpectedFacts, boolean>>;
}
