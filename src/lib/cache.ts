// TTL + schema-version cache logic for section reports stored in Supabase.
import { supabaseAdmin as supabase } from "./supabase/admin";
import type { SectionDefinition, Citation } from "./sections/types";
import { differenceInDays } from "date-fns";

type CachedSection<T = unknown> = {
  content: T;
  citations: Citation[];
  generatedAt: Date;
  modelVersion: string;
};

export async function getCachedSection<T>(
  companyId: string,
  section: SectionDefinition<T>
): Promise<CachedSection<T> | null> {
  const { data, error } = await supabase
    .from("reports")
    .select("content_json, citations_json, generated_at, model_version, schema_version")
    .eq("company_id", companyId)
    .eq("section_key", section.key)
    .single();

  if (error || !data) return null;

  // Reject stale schema versions
  if ((data as { schema_version: number }).schema_version !== section.schemaVersion) return null;

  // Reject expired TTL
  const age = differenceInDays(new Date(), new Date((data as { generated_at: string }).generated_at));
  if (age >= section.cacheTtlDays) return null;

  return {
    content: (data as { content_json: T }).content_json,
    citations: ((data as { citations_json: Citation[] }).citations_json ?? []) as Citation[],
    generatedAt: new Date((data as { generated_at: string }).generated_at),
    modelVersion: (data as { model_version: string }).model_version,
  };
}

export async function upsertCachedSection<T>(
  companyId: string,
  section: SectionDefinition<T>,
  content: T,
  citations: Citation[],
  modelVersion: string
): Promise<void> {
  const { error } = await supabase.from("reports").upsert(
    {
      company_id: companyId,
      section_key: section.key,
      schema_version: section.schemaVersion,
      content_json: content,
      citations_json: citations,
      generated_at: new Date().toISOString(),
      model_version: modelVersion,
    },
    { onConflict: "company_id,section_key" }
  );

  if (error) {
    throw new Error(`Failed to upsert section cache: ${error.message}`);
  }
}
