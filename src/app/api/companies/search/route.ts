// GET /api/companies/search — typeahead across all cached companies.
// Auth-gated (401 if no session) but not scoped to the current user's
// history — a cache hit by any user benefits everyone. Clicking a result
// records a search_history visit via the /company/[slug] page, which is
// what makes the company appear in the current user's sidebar.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (process.env.MOCK_RESEARCH === "true") {
    const match =
      q.length >= 2 &&
      ("anthropic".includes(q.toLowerCase()) ||
        q.toLowerCase().includes("anthropic"));
    return NextResponse.json(
      match
        ? [
            {
              slug: "anthropic",
              display_name: "Anthropic",
              domain: "anthropic.com",
              logo_url: null,
              last_refreshed_at: new Date().toISOString(),
            },
          ]
        : [],
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = supabaseServer(
    cookies() as unknown as Parameters<typeof supabaseServer>[0],
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (q.length < 2) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("slug, display_name, domain, logo_url, last_refreshed_at")
    .or(`display_name.ilike.${pattern},slug.ilike.${pattern}`)
    .order("last_refreshed_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "no-store" },
  });
}
