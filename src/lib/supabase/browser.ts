// Browser-only Supabase client. Stores session in `sb-*` cookies managed by
// @supabase/ssr. Singleton — one instance per browser tab. The cache lives on
// `globalThis` so Fast Refresh / React strict-mode re-mounts don't spawn a
// second GoTrueClient under the same storage key (the SDK warns when that
// happens).
import { createBrowserClient } from "@supabase/ssr";

type Client = ReturnType<typeof createBrowserClient>;
const GLOBAL_KEY = "__founderscope_supabase_browser__";
type GlobalWithCache = typeof globalThis & { [GLOBAL_KEY]?: Client };

export function supabaseBrowser(): Client {
  const g = globalThis as GlobalWithCache;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY]!;
  g[GLOBAL_KEY] = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
  );
  return g[GLOBAL_KEY]!;
}
