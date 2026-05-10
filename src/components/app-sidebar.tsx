// App-level sidebar — logomark + search trigger + recents + settings footer.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Settings, Search } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logomark } from "./logomark";
import { useSearchPalette } from "./search-palette-provider";
import { useRecents } from "@/hooks/use-recents";
import { formatRelative } from "@/lib/format";

export function AppSidebar() {
  const pathname = usePathname();
  const { openPalette } = useSearchPalette();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { entries: recents } = useRecents();

  const isHome = pathname === "/";
  const isSettings = pathname === "/settings";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/" aria-label="FounderScope home">
              <SidebarMenuButton
                className="hover:bg-transparent"
                tooltip="FounderScope"
              >
                <Logomark size={20} />
                {!collapsed && (
                  <span
                    className="serif"
                    style={{ fontSize: 17, color: "var(--text)", letterSpacing: "-0.01em" }}
                  >
                    FounderScope
                  </span>
                )}
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Search trigger */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => openPalette()}
              tooltip="Search (⌘K)"
              className="t-200"
            >
              <Search />
              {!collapsed && (
                <>
                  <span style={{ flex: 1, color: "var(--text-faint)", fontSize: 13 }}>
                    Research a company…
                  </span>
                  <kbd
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      color: "var(--text-quiet)",
                      padding: "1px 5px",
                      border: "1px solid var(--border-color)",
                      borderRadius: 4,
                    }}
                  >
                    ⌘K
                  </kbd>
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/">
                  <SidebarMenuButton isActive={isHome} tooltip="Home">
                    <Home />
                    {!collapsed && <span>Home</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="eyebrow">
              Recently researched
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {recents.length === 0 ? (
                <div
                  className="px-3 py-2 text-xs italic"
                  style={{
                    color: "var(--text-faint)",
                    fontFamily: "var(--font-serif)",
                  }}
                >
                  No recent searches yet.
                </div>
              ) : (
                <SidebarMenu>
                  {recents.map((r) => {
                    const href = `/company/${r.slug}`;
                    const active = pathname === href;
                    return (
                      <SidebarMenuItem key={r.slug}>
                        <Link href={href}>
                          <SidebarMenuButton
                            isActive={active}
                            tooltip={r.display_name}
                            className="t-200"
                          >
                            <span
                              className="serif truncate"
                              style={{
                                flex: 1,
                                fontSize: 13,
                                color: active ? "var(--text)" : "var(--text-soft)",
                                letterSpacing: "-0.005em",
                              }}
                            >
                              {r.display_name}
                            </span>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 10,
                                color: "var(--text-quiet)",
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                              }}
                            >
                              {formatRelative(r.searched_at)}
                            </span>
                          </SidebarMenuButton>
                        </Link>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/settings">
              <SidebarMenuButton isActive={isSettings} tooltip="Settings">
                <Settings />
                {!collapsed && <span>Settings</span>}
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div
            className="flex items-center justify-between px-3 pt-1 pb-1"
            style={{ color: "var(--text-quiet)", fontSize: 11 }}
          >
            <span>v0.4 · open source</span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--rep-green)" }}
              />
              cache fresh
            </span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
