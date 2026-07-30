/**
 * Per-section domain allowlists for grounded search (design spec D5).
 * Bias, not a hard filter — sparse results fall back to open search via
 * source-fallback.ts dropping includeDomains rather than swapping lists.
 *
 * Values here are EXA `includeDomains` filters: hostname, hostname/path prefix,
 * or *.hostname — never bare path segments or trailing-dot host prefixes (those
 * belong in evals/domains.ts for substring URL scoring, not API filters).
 */
export type CompanyMaturity = "early-stage" | "enterprise";

/** Default when disambiguation omits maturity — early-stage bias is safer for unknowns. */
export const DEFAULT_MATURITY: CompanyMaturity = "early-stage";

export const EARLY_STAGE_DOMAINS: readonly string[] = [
  "ycombinator.com/companies",
  "crunchbase.com",
  "producthunt.com",
  "wellfound.com",
  "sec.gov",
  "github.com",
  "linkedin.com/company",
  "opencorporates.com",
];

export const ENTERPRISE_DOMAINS: readonly string[] = [
  "sec.gov/edgar",
  "annualreports.com",
  "find-and-update.company-information.service.gov.uk",
  "macrotrends.net",
];

export const TECH_STACK_DOMAINS: readonly string[] = [
  "builtwith.com",
  "stackshare.io",
  "github.com",
];

/** Mirrors the `key` of every entry in src/lib/sections/registry.ts. */
export type SectionKey =
  | "snapshot"
  | "moat"
  | "founders"
  | "tech_stack"
  | "funding"
  | "traction"
  | "market";

/**
 * Sections whose sources are their own, regardless of company maturity.
 *
 * A map rather than an `if` because the next section that needs its own list
 * (analyst sources for `market`, people sources for `founders`) should be a table
 * entry, not another branch — and because a branch silently drops the maturity
 * dimension, which is what happened to `tech_stack`: an enterprise company's
 * tech-stack search never sees sec.gov or annualreports.com.
 */
const SECTION_OVERRIDES: Partial<Record<SectionKey, readonly string[]>> = {
  tech_stack: TECH_STACK_DOMAINS,
};

/**
 * Per-section pages worth allowlisting on the company's OWN domain once it is
 * known. This is how investor-relations and careers pages are reached at all:
 * `includeDomains` cannot express "any host beginning with ir.", but it can
 * express `stripe.com/investors` and `*.stripe.com`.
 */
const SECTION_COMPANY_PATHS: Partial<
  Record<SectionKey, (domain: string) => readonly string[]>
> = {
  tech_stack: (domain) => [`${domain}/careers`, `*.${domain}`],
};

/** EXA-legal includeDomains value — no bare paths, no trailing-dot host prefixes. */
export function isLegalIncludeDomain(entry: string): boolean {
  return entry.length > 0 && !entry.startsWith("/") && !entry.endsWith(".");
}

function normalizeCompanyDomain(domain: string | null | undefined): string | null {
  const trimmed = domain?.trim().toLowerCase() ?? "";
  if (trimmed.length === 0) return null;
  return trimmed.replace(/^www\./, "");
}

function companyEnterpriseDomains(domain: string): readonly string[] {
  return [`${domain}/investors`, `${domain}/investor`, `*.${domain}`];
}

export function allowlistForSection(
  sectionKey: string,
  maturity: CompanyMaturity,
  canonicalDomain: string | null = null,
): readonly string[] {
  const domain = normalizeCompanyDomain(canonicalDomain);
  const key = sectionKey as SectionKey;

  // Returns the frozen constant untouched when there is nothing to append, so
  // the common no-domain call allocates nothing.
  const override = SECTION_OVERRIDES[key];
  if (override) {
    const companyPaths = domain ? SECTION_COMPANY_PATHS[key]?.(domain) : undefined;
    return companyPaths
      ? [...override, ...companyPaths.filter(isLegalIncludeDomain)]
      : override;
  }

  const base =
    maturity === "enterprise" ? ENTERPRISE_DOMAINS : EARLY_STAGE_DOMAINS;
  if (maturity === "enterprise" && domain) {
    // Filtered, not trusted: the company-derived entries interpolate a domain
    // that ultimately comes from the request body, so a malformed one would
    // otherwise reach EXA as an illegal filter value and 400 the search. The
    // constant lists above are legal by construction.
    return [...base, ...companyEnterpriseDomains(domain).filter(isLegalIncludeDomain)];
  }
  return base;
}
