import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

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

  return <LoginForm next={searchParams.next ?? "/"} initialError={searchParams.error} />;
}
