// Server-side Supabase client — uses service role key, never exposed to browser.
import { createClient } from "@supabase/supabase-js";

// Safe fallback for build-time static analysis; real values required at runtime.
export const supabase = createClient(
  process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
