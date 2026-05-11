"use client";
// Sidebar footer user row. Renders a skeleton until the browser client
// resolves the current user; this avoids hydration flicker because the
// initial server render has no access to the cookie-derived avatar URL.
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function UserBadge() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [user, setUser] = useState<User | null | "loading">("loading");

  useEffect(() => {
    let mounted = true;
    supabaseBrowser()
      .auth.getUser()
      .then((res: { data: { user: User | null } }) => {
        if (mounted) setUser(res.data.user ?? null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  };

  if (user === "loading") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton aria-label="Loading user">
            <span
              className="inline-block rounded-full"
              style={{ width: 20, height: 20, background: "var(--bg-hover)" }}
            />
            {!collapsed && (
              <span
                className="inline-block rounded"
                style={{ height: 11, width: 96, background: "var(--bg-hover)" }}
              />
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!user) return null;

  const avatarUrl =
    (user.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ??
    null;
  const email = user.email ?? "Signed in";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={collapsed ? signOut : undefined}
          tooltip={collapsed ? "Sign out" : email}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={20}
              height={20}
              className="rounded-full"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <span
              className="inline-flex items-center justify-center rounded-full font-mono"
              style={{
                width: 20,
                height: 20,
                fontSize: 9,
                background: "var(--avatar-0-bg)",
                color: "var(--avatar-0-fg)",
                border: "1px solid var(--avatar-0-border)",
              }}
            >
              {initials}
            </span>
          )}
          {!collapsed && (
            <>
              <span
                className="truncate"
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {email}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  signOut();
                }}
                aria-label="Sign out"
                className="t-200"
                style={{ color: "var(--text-quiet)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--accent-color)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-quiet)";
                }}
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
