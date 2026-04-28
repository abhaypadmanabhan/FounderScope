// Company row resolution: find existing by slug, otherwise insert with collision handling.
import { supabase } from "./supabase";
import { resolveCollisionSlug, slugify } from "./slug";

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

export async function findOrCreateCompany(
  name: string,
  domain: string | null
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
      return await insertCompany(altSlug, name, domain);
    }
    return existing;
  }

  return await insertCompany(baseSlug, name, domain);
}

async function insertCompany(
  slug: string,
  displayName: string,
  domain: string | null
): Promise<CompanyRow> {
  const tokens = [slug, displayName.toLowerCase()];
  if (domain) tokens.push(domain.toLowerCase());

  const { data, error } = await supabase
    .from("companies")
    .insert({
      slug,
      display_name: displayName,
      domain,
      search_tokens: tokens,
      last_refreshed_at: new Date().toISOString(),
    })
    .select("id, slug, display_name, domain, logo_url, last_refreshed_at")
    .single();

  if (error) throw new Error(`insertCompany: ${error.message}`);
  return data as CompanyRow;
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
