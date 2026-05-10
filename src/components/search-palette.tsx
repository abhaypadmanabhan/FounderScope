// ⌘K search palette — typeahead against /api/companies/search + fresh-research action.
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, ArrowRight, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { slugify } from "@/lib/slug";
import { formatRelative } from "@/lib/format";
import { CompanyLogo } from "./company-logo";

interface SearchHit {
  slug: string;
  display_name: string;
  domain: string | null;
  logo_url: string | null;
  last_refreshed_at: string | null;
}

interface Props {
  open: boolean;
  initialQuery?: string;
  onOpenChange: (open: boolean) => void;
}

export function SearchPalette({ open, initialQuery = "", onOpenChange }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
    }
  }, [open, initialQuery]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/companies/search?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as SearchHit[];
          setHits(Array.isArray(data) ? data : []);
        } else {
          setHits([]);
        }
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function navigate(slug: string) {
    onOpenChange(false);
    router.push(`/company/${slug}`);
  }

  function freshResearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(slugify(deriveCompanyName(trimmed)));
  }

  const trimmed = query.trim();
  const showFreshRow = trimmed.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[14vh] left-1/2 -translate-x-1/2 translate-y-0 w-[min(640px,calc(100vw-2rem))] max-w-none p-0 overflow-hidden gap-0"
        showCloseButton={false}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <Command
          loop
          shouldFilter={false}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
        >
          {/* Input row */}
          <div
            className="flex items-center gap-3 px-4 py-3.5"
            style={{ borderBottom: "1px solid var(--border-faint)" }}
          >
            <Search size={16} style={{ color: "var(--text-faint)" }} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Research a company…"
              className="flex-1 bg-transparent border-0 outline-none text-base"
              style={{ color: "var(--text)", fontFamily: "inherit" }}
            />
            <Kbd>esc</Kbd>
          </div>

          {/* Results */}
          <Command.List className="p-1.5 max-h-[380px] overflow-y-auto">
            {hits.length > 0 && (
              <div className="eyebrow px-2.5 pt-1.5 pb-1">From your cache</div>
            )}

            <Command.Group>
              {hits.map((c) => (
                <Command.Item
                  key={c.slug}
                  value={`hit-${c.slug}`}
                  onSelect={() => navigate(c.slug)}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-md cursor-pointer data-[selected=true]:bg-[var(--bg-active)] t-200"
                >
                  <CompanyLogo name={c.display_name} domain={c.domain} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: "var(--text)" }}>
                      {c.display_name}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "var(--text-faint)" }}
                    >
                      researched {formatRelative(c.last_refreshed_at)}
                    </div>
                  </div>
                  <CornerDownLeft size={14} style={{ color: "var(--text-faint)" }} />
                </Command.Item>
              ))}
            </Command.Group>

            {/* Empty + loading hints */}
            {!loading && hits.length === 0 && trimmed.length >= 2 && (
              <div
                className="px-2.5 py-3 text-sm"
                style={{ color: "var(--text-faint)" }}
              >
                No cached matches.
              </div>
            )}
            {trimmed.length > 0 && trimmed.length < 2 && (
              <div
                className="px-2.5 py-3 text-sm"
                style={{ color: "var(--text-faint)" }}
              >
                Keep typing…
              </div>
            )}
            {trimmed.length === 0 && (
              <div
                className="px-2.5 py-3 text-sm"
                style={{ color: "var(--text-faint)" }}
              >
                Type a company name to search the cache or kick off fresh research.
              </div>
            )}

            {/* Separator + fresh-research row */}
            {showFreshRow && (
              <>
                <div
                  className="h-px my-2 mx-1"
                  style={{ background: "var(--border-faint)" }}
                />
                <Command.Item
                  value="__fresh__"
                  onSelect={freshResearch}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer data-[selected=true]:bg-[var(--bg-active)] t-200"
                >
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded"
                    style={{
                      border: "1px dashed var(--border-strong)",
                      color: "var(--accent-color)",
                    }}
                  >
                    <ArrowRight size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: "var(--text)" }}>
                      Press <Kbd inline>Enter</Kbd> to research{" "}
                      <span style={{ color: "var(--accent-color)", fontWeight: 500 }}>
                        {trimmed}
                      </span>
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      Fresh research · uses your Anthropic API key
                    </div>
                  </div>
                </Command.Item>
              </>
            )}
          </Command.List>

          {/* Footer */}
          <div
            className="flex items-center gap-3.5 px-3.5 py-2 text-[11px]"
            style={{
              borderTop: "1px solid var(--border-faint)",
              color: "var(--text-quiet)",
            }}
          >
            <span className="inline-flex items-center gap-1">
              <Kbd inline>↑</Kbd>
              <Kbd inline>↓</Kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd inline>↵</Kbd> select
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd inline>esc</Kbd> close
            </span>
            <span className="flex-1" />
            {loading && <span>searching…</span>}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// Strip URL/host inputs down to a company-name root. "https://www.stackai.com" → "stackai".
// Falls through to the original input when it doesn't look URL-shaped.
function deriveCompanyName(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/^(?:https?:\/\/)?([^\s/?#]+)/i);
  if (urlMatch && urlMatch[1].includes(".")) {
    const host = urlMatch[1].replace(/^www\./i, "");
    const root = host.split(".")[0];
    if (root) return root;
  }
  return trimmed;
}

function Kbd({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <kbd
      className="font-mono"
      style={{
        fontSize: inline ? 10 : 11,
        color: "var(--text-faint)",
        padding: inline ? "1px 5px" : "2px 6px",
        border: "1px solid var(--border-color)",
        borderRadius: inline ? 3 : 4,
        background: inline ? "var(--bg)" : "var(--bg-sunken)",
        margin: inline ? "0 1px" : 0,
      }}
    >
      {children}
    </kbd>
  );
}

