// Login page. Already-authenticated visitors get bounced to home immediately.
// The UI form is the minimal placeholder until slice 5 swaps in the
// frontend-design-built <LoginForm />. Both Google OAuth and email magic
// link route through /auth/callback.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const supabase = supabaseServer(
    cookies() as unknown as Parameters<typeof supabaseServer>[0],
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(searchParams.next ?? "/");
  }

  return (
    <main
      style={{
        padding: 48,
        fontFamily: "var(--font-serif, serif)",
        color: "var(--text, #222)",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Sign in to FounderScope</h1>
      {searchParams.error ? (
        <p style={{ color: "crimson", marginBottom: 16 }}>
          {errorMessage(searchParams.error)}
        </p>
      ) : null}
      <p style={{ color: "var(--text-quiet, #888)" }}>
        Login UI lands in the next slice.
      </p>
    </main>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "link_invalid":
      return "That magic link expired or was already used. Request a new one.";
    case "oauth_cancelled":
      return "Sign-in cancelled.";
    default:
      return "Sign-in failed. Try again.";
  }
}
