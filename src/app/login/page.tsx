import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string; detail?: string };
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

  const initialError = searchParams.error
    ? searchParams.error === "exchange_failed" && searchParams.detail
      ? `exchange_failed:${searchParams.detail}`
      : searchParams.error
    : undefined;

  return <LoginForm next={searchParams.next ?? "/"} initialError={initialError} />;
}
