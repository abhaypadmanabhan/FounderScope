// Root layout — sidebar shell + search palette provider wraps all pages.
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Newsreader } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SearchPaletteProvider } from "@/components/search-palette-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "FounderScope",
  description: "Research any company through a founder's eyes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased`}
      >
        <TooltipProvider>
          <SearchPaletteProvider>
            <SidebarProvider>
              <AppSidebar />
              <div className="flex flex-1 flex-col min-h-screen">
                <main className="flex-1">{children}</main>
              </div>
            </SidebarProvider>
            <Toaster richColors position="bottom-right" />
          </SearchPaletteProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
