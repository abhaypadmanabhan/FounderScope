// GET — last 8 companies this user visited, most recent first.
// POST — record (or refresh) a visit. Upserts on (user_id, company_id) so a
// repeat visit just bumps `searched_at`.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecentRow = {
  searched_at: string;
  companies: { slug: string; display_name: string } | null;
};

function client() {
  return supabaseServer(
    cookies() as unknown as Parameters<typeof supabaseServer>[0],
  );
}

export async function GET() {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ entries: [] });
  }

  const supabase = client();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("search_history")
    .select("searched_at, companies!inner(slug, display_name)")
    .order("searched_at", { ascending: false })
    .limit(8);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = ((data ?? []) as unknown as RecentRow[])
    .filter((r) => r.companies)
    .map((r) => ({
      slug: r.companies!.slug,
      display_name: r.companies!.display_name,
      searched_at: r.searched_at,
    }));

  return NextResponse.json(
    { entries },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const postSchema = z.object({ slug: z.string().min(1) });

export async function POST(request: Request) {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ ok: true });
  }

  const supabase = client();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // companies is a shared cache (no RLS). Use the admin client so we don't
  // depend on anon-role SELECT grants being in place on every project.
  const { data: company, error: companyErr } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("slug", body.slug)
    .maybeSingle();

  if (companyErr) {
    console.error("[search-history POST] companies lookup failed", companyErr);
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }
  if (!company) {
    console.error("[search-history POST] company not found for slug", body.slug);
    return NextResponse.json({ error: "company_not_found" }, { status: 404 });
  }

  // Use the admin client for the upsert. The user_id is set explicitly
  // from the authenticated session (above), so write authorization is
  // enforced at the application layer. RLS still scopes READS to the
  // owner via the user-scoped client.
  const { error: upsertErr } = await supabaseAdmin
    .from("search_history")
    .upsert(
      {
        user_id: userData.user.id,
        company_id: (company as { id: string }).id,
        searched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,company_id" },
    );

  if (upsertErr) {
    console.error("[search-history POST] upsert failed", upsertErr);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
