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
  // The trailing extension group keeps public static assets (brand mark, the
  // app-router icon.png/apple-icon.png, fonts) from being auth-gated — without
  // it, an unauthenticated <img src="/founderscope-mark.png"> gets redirected
  // to /login and renders the login HTML instead of the image.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|login|auth/callback|api/auth|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$).*)",
  ],
};
