// GET /api/companies/search — typeahead by display_name (and slug fallback). Returns up to 5.
import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  if (process.env.MOCK_RESEARCH === "true") {
    const match =
      "anthropic".includes(q.toLowerCase()) || q.toLowerCase().includes("anthropic");
    return NextResponse.json(
      match
        ? [{ slug: "anthropic", display_name: "Anthropic", domain: "anthropic.com", logo_url: null, last_refreshed_at: new Date().toISOString() }]
        : [],
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  const { data, error } = await supabase
    .from("companies")
    .select("slug, display_name, domain, logo_url, last_refreshed_at")
    .or(`display_name.ilike.${pattern},slug.ilike.${pattern}`)
    .order("last_refreshed_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}
