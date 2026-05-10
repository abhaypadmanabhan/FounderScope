// GET — last 8 visited companies, most recent first.
// POST — record a visit for a slug; deletes prior rows for the same company so the most recent visit wins (dedupe).
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecentRow = {
  searched_at: string;
  companies: { slug: string; display_name: string } | null;
};

export async function GET() {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ entries: [] });
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

  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}

const postSchema = z.object({ slug: z.string().min(1) });

export async function POST(request: Request) {
  if (process.env.MOCK_RESEARCH === "true") {
    return NextResponse.json({ ok: true });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", body.slug)
    .maybeSingle();

  if (companyErr) {
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "company_not_found" }, { status: 404 });
  }

  const companyId = (company as { id: string }).id;

  await supabase.from("search_history").delete().eq("company_id", companyId);
  const { error: insertErr } = await supabase
    .from("search_history")
    .insert({ company_id: companyId });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
