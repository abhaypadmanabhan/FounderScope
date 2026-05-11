// GET /api/companies/search — typeahead over this user's researched companies.
// Joins search_history → companies so only entries in the user's history
// surface. RLS auto-scopes the search_history rows; the join filters the
// companies accordingly.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  companies: {
    slug: string;
    display_name: string;
    domain: string | null;
    logo_url: string | null;
    last_refreshed_at: string | null;
  } | null;
};

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

  const { data, error } = await supabase
    .from("search_history")
    .select(
      "companies!inner(slug, display_name, domain, logo_url, last_refreshed_at)",
    )
    .or(`display_name.ilike.${pattern},slug.ilike.${pattern}`, {
      foreignTable: "companies",
    })
    .order("searched_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const out = ((data ?? []) as unknown as Row[])
    .map((r) => r.companies)
    .filter((c): c is NonNullable<Row["companies"]> => c !== null);

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
