// Authenticated app shell — sidebar + search palette. Wraps every route in this
// group ("/", "/company/...", "/settings"). /login and /auth/callback live
// outside this group, so they never see the sidebar.
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SearchPaletteProvider } from "@/components/search-palette-provider";

export default function HomeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SearchPaletteProvider>
      <SidebarProvider>
        <AppSidebar />
        <div className="flex flex-1 flex-col min-h-screen">
          <main className="flex-1">{children}</main>
        </div>
      </SidebarProvider>
    </SearchPaletteProvider>
  );
}
