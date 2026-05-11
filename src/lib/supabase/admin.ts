// Service-role Supabase client. Server-only. Bypasses RLS.
// Used for cross-user shared tables: companies, reports, exa_search_cache.
// Never import this from a Client Component or anything reachable from the browser bundle.
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
