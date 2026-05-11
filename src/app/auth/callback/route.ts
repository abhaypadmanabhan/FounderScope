// OAuth + magic-link callback. Supabase redirects here with ?code=<one-time>.
// We exchange the code for a session (which sets `sb-*` cookies via the
// server client) and then redirect to the original destination.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_error", url.origin));
  }

  const supabase = supabaseServer(
    cookies() as unknown as Parameters<typeof supabaseServer>[0],
  );
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=link_invalid", url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
