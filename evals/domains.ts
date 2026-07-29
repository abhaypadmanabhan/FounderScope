import type { CompanyMaturity } from "./types";

/**
 * Section domain allowlists per design spec D5.
 * Mirrors the planned src/lib/search/domains.ts wiring (C1); kept in evals/
 * so scorers are self-contained until that lands.
 */
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
  "investors.",
  "/investor",
  "/investors",
  "ir.",
  "find-and-update.company-information.service.gov.uk",
  "macrotrends.net",
];

export const TECH_STACK_DOMAINS: readonly string[] = [
  "builtwith.com",
  "stackshare.io",
  "github.com",
  "/careers",
  "careers.",
];

export function allowlistForSection(
  sectionKey: string,
  maturity: CompanyMaturity
): readonly string[] {
  if (sectionKey === "tech_stack") {
    return TECH_STACK_DOMAINS;
  }
  return maturity === "enterprise" ? ENTERPRISE_DOMAINS : EARLY_STAGE_DOMAINS;
}

/** Returns true when a citation URL matches any allowlist entry (host or path prefix). */
export function urlMatchesAllowlist(
  url: string,
  allowlist: readonly string[]
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  for (const entry of allowlist) {
    const normalized = entry.toLowerCase();

    if (normalized.startsWith("/")) {
      if (path === normalized || path.startsWith(`${normalized}/`)) return true;
      continue;
    }

    if (normalized.endsWith(".")) {
      if (host.startsWith(normalized) || host.includes(`.${normalized.slice(0, -1)}`)) {
        return true;
      }
      continue;
    }

    if (normalized.includes("/")) {
      const slash = normalized.indexOf("/");
      const entryHost = normalized.slice(0, slash);
      const entryPath = normalized.slice(slash);
      if (
        (host === entryHost || host.endsWith(`.${entryHost}`)) &&
        path.startsWith(entryPath)
      ) {
        return true;
      }
      continue;
    }

    if (host === normalized || host.endsWith(`.${normalized}`)) {
      return true;
    }
  }

  return false;
}
