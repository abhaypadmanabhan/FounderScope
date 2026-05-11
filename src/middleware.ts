import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (user) return response;

  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Whitelist-by-exclusion. Pages that absolutely must never redirect (login,
  // callback) are excluded; everything else gets the session-refresh + gate.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|login|auth/callback|api/auth).*)",
  ],
};
