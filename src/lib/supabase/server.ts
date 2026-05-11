// Per-request, anon-key, cookie-aware Supabase client for Server Components
// and Route Handlers. RLS-enforced — reads `auth.uid()` from the JWT in the
// `sb-*` cookies. Construct once per request; do not cache across requests.
import { createServerClient } from "@supabase/ssr";

type CookieStore = {
  getAll(): { name: string; value: string }[];
  set?(name: string, value: string, options?: Record<string, unknown>): void;
};

export function supabaseServer(cookieStore: CookieStore) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "https://placeholder.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set?.(name, value, options);
          }
        } catch {
          // Server Component path: cookies are read-only. Ignore;
          // middleware.ts is the writer of record.
        }
      },
    },
  });
}
