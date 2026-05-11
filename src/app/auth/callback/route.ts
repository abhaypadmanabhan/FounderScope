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
  const cookieStore = cookies() as unknown as Parameters<
    typeof supabaseServer
  >[0] & {
    get(name: string): { value: string } | undefined;
    set?(
      name: string,
      value: string,
      options?: Record<string, unknown>,
    ): void;
  };

  // Prefer ?next= query param (legacy), fall back to fs_next cookie
  // stashed by the login form before the OAuth round-trip.
  const queryNext = url.searchParams.get("next");
  const cookieNext = cookieStore.get?.("fs_next")?.value;
  const next = queryNext ?? (cookieNext ? decodeURIComponent(cookieNext) : "/");

  // Best-effort: clear the stash cookie so it doesn't leak into a later session.
  cookieStore.set?.("fs_next", "", { maxAge: 0, path: "/" });

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_error", url.origin));
  }

  const supabase = supabaseServer(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=link_invalid", url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
