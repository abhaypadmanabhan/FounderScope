import {
  EARLY_STAGE_DOMAINS as PRODUCT_EARLY_STAGE_DOMAINS,
  ENTERPRISE_DOMAINS as PRODUCT_ENTERPRISE_DOMAINS,
  TECH_STACK_DOMAINS as PRODUCT_TECH_STACK_DOMAINS,
} from "@/lib/search/domains";
import type { CompanyMaturity } from "./types";

/**
 * Scoring-side view of the section allowlists (design spec D5).
 *
 * The shared entries are imported from `@/lib/search/domains`, which is what the
 * product actually sends as EXA `includeDomains`. Keeping a second copy here
 * meant `domain-adherence` graded production against a list production never
 * sent: edit one and the metric silently measures a stale allowlist, and a wrong
 * score is the hardest kind of wrong to notice.
 *
 * The two are still NOT interchangeable, which is why this file remains.
 * `includeDomains` accepts only a hostname, a hostname with a path prefix, or a
 * wildcard subdomain — never a bare path segment. Scoring has no such limit and
 * genuinely wants the bare patterns below, because production reaches
 * investor-relations and careers pages via the company's own domain plus
 * `*.domain`, and a citation to `ir.stripe.com` should still score as
 * on-allowlist. So the shared entries are imported and the scoring-only ones are
 * declared explicitly, instead of the divergence being implied by duplication.
 */
const SCORING_ONLY_ENTERPRISE: readonly string[] = [
  "investors.",
  "/investor",
  "/investors",
  "ir.",
];

const SCORING_ONLY_TECH_STACK: readonly string[] = ["/careers", "careers."];

export const EARLY_STAGE_DOMAINS: readonly string[] = [
  ...PRODUCT_EARLY_STAGE_DOMAINS,
];

export const ENTERPRISE_DOMAINS: readonly string[] = [
  ...PRODUCT_ENTERPRISE_DOMAINS,
  ...SCORING_ONLY_ENTERPRISE,
];

export const TECH_STACK_DOMAINS: readonly string[] = [
  ...PRODUCT_TECH_STACK_DOMAINS,
  ...SCORING_ONLY_TECH_STACK,
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
