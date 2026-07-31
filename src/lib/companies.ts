// Company row resolution: find existing by slug, otherwise insert with collision handling.
import { supabaseAdmin as supabase } from "./supabase/admin";
import { resolveCollisionSlug, slugify } from "./slug";
import { findCompanyLogo } from "./search/logo";
import type { SearchUsage } from "./search/types";

export type CompanyRow = {
  id: string;
  slug: string;
  display_name: string;
  domain: string | null;
  logo_url: string | null;
  last_refreshed_at: string | null;
};

export async function getCompanyBySlug(slug: string): Promise<CompanyRow | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, slug, display_name, domain, logo_url, last_refreshed_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getCompanyBySlug: ${error.message}`);
  return (data ?? null) as CompanyRow | null;
}

/**
 * `usage` is the caller's request-scoped counter. Passing it is what makes the
 * one EXA call an insert can make (the logo lookup) show up in the request's
 * reported totals instead of vanishing.
 */
export async function findOrCreateCompany(
  name: string,
  domain: string | null,
  usage?: SearchUsage
): Promise<CompanyRow> {
  const baseSlug = slugify(name);

  const existing = await getCompanyBySlug(baseSlug);
  if (existing) {
    if (existing.display_name.toLowerCase() === name.toLowerCase() || !domain) {
      return existing;
    }
    if (domain) {
      const altSlug = resolveCollisionSlug(name, domain);
      const altExisting = await getCompanyBySlug(altSlug);
      if (altExisting) return altExisting;
      return await insertCompany(altSlug, name, domain, usage);
    }
    return existing;
  }

  return await insertCompany(baseSlug, name, domain, usage);
}

async function insertCompany(
  slug: string,
  displayName: string,
  domain: string | null,
  usage?: SearchUsage
): Promise<CompanyRow> {
  const tokens = [slug, displayName.toLowerCase()];
  if (domain) tokens.push(domain.toLowerCase());

  const logoUrl = await fetchLogoSilently(displayName, domain, usage);

  const { data, error } = await supabase
    .from("companies")
    .insert({
      slug,
      display_name: displayName,
      domain,
      logo_url: logoUrl,
      search_tokens: tokens,
      last_refreshed_at: new Date().toISOString(),
    })
    .select("id, slug, display_name, domain, logo_url, last_refreshed_at")
    .single();

  if (error) throw new Error(`insertCompany: ${error.message}`);
  return data as CompanyRow;
}

// Best-effort logo lookup. Never throws — a missing logo is fine, the UI
// falls back to Clearbit then to a serif initial.
async function fetchLogoSilently(
  name: string,
  domain: string | null,
  usage?: SearchUsage,
): Promise<string | null> {
  const providerId = process.env.SEARCH_PROVIDER ?? "exa";
  // Only EXA's key is forwarded, because only EXA can return a real logo image.
  // A Firecrawl or Tavily user falls through to the free favicon path rather
  // than spending one of their search slots on something derivable offline.
  const exaApiKey = providerId === "exa" ? process.env.EXA_API_KEY : null;

  try {
    // No budget: budgets are per model call (createSearchBudget lives inside
    // runResearchCall), so there is no request-scoped one to debit here. Minting
    // a fresh 8-slot budget per insert was accounting theatre — it could never
    // be exhausted and its counters were discarded on return, which is exactly
    // what findCompanyLogo's contract says not to do. The caller's `usage` is
    // real and is threaded through; the missing spend cap is tracked in
    // tasks/todo.md rather than faked here.
    return await findCompanyLogo({ name, domain }, { exaApiKey, usage });
  } catch {
    return null;
  }
}

export async function touchLastRefreshed(companyId: string): Promise<void> {
  await supabase
    .from("companies")
    .update({ last_refreshed_at: new Date().toISOString() })
    .eq("id", companyId);
}

export async function updateCompanyCanonical(
  id: string,
  displayName: string,
  domain: string | null
): Promise<void> {
  const tokens = [slugify(displayName), displayName.toLowerCase()];
  if (domain) tokens.push(domain.toLowerCase());
  await supabase
    .from("companies")
    .update({ display_name: displayName, domain, search_tokens: tokens })
    .eq("id", id);
}
