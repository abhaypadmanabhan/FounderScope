// GET /api/companies/[slug] — cached report: company + all section rows with derived status.
import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";
import { countCitationStatuses } from "@/lib/citations";
import type { Citation } from "@/lib/sections/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const slug = params.slug;
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, slug, display_name, domain, logo_url, last_refreshed_at")
    .eq("slug", slug)
    .maybeSingle();

  if (companyErr) {
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: reports, error: reportsErr } = await supabase
    .from("reports")
    .select("section_key, content_json, citations_json, generated_at, model_version, schema_version")
    .eq("company_id", (company as { id: string }).id);

  if (reportsErr) {
    return NextResponse.json({ error: reportsErr.message }, { status: 500 });
  }

  const sections = (reports ?? []).map((r: {
    section_key: string;
    content_json: unknown;
    citations_json: unknown;
    generated_at: string;
    model_version: string;
    schema_version: number;
  }) => {
    const citations = (Array.isArray(r.citations_json) ? r.citations_json : []) as Citation[];
    return {
      section_key: r.section_key,
      content: r.content_json,
      citations,
      generated_at: r.generated_at,
      model_version: r.model_version,
      schema_version: r.schema_version,
      status: deriveStatus(citations),
      citation_status: countCitationStatuses(citations),
    };
  });

  return NextResponse.json(
    { company, sections },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function deriveStatus(citations: Citation[]): "ok" | "stale" {
  if (citations.length === 0) return "ok";
  const dead = citations.filter((c) => c.status === "dead").length;
  return dead / citations.length > 0.30 ? "stale" : "ok";
}
