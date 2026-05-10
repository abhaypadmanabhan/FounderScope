// Citation superscript with hover popover (source / quote / open-link).
// Hover opens a Popover; click still opens the URL in a new tab (preserved
// from the prior click-only implementation, so touch devices degrade
// gracefully — base-ui hover triggers no-op on touch).
"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { Citation } from "@/lib/sections/types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const STATUS_COPY: Record<string, { label: string; color: string }> = {
  dead: { label: "source unavailable", color: "var(--rep-red)" },
  gated: { label: "gated content", color: "var(--rep-amber)" },
};

export function CitationSup({ citation }: { citation: Citation }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.open(citation.url, "_blank", "noopener");
    }
  };

  const domain = getDomain(citation.url);
  const status = citation.status === "dead" || citation.status === "gated" ? citation.status : null;
  const statusMeta = status ? STATUS_COPY[status] : null;
  const body = citation.quote || citation.claim;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={120}
        closeDelay={80}
        nativeButton={false}
        render={
          <sup
            className="cite"
            onClick={handleClick}
            aria-label={`Citation ${citation.id}: ${domain}`}
          >
            {citation.id}
          </sup>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" align="center" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup
            className="z-50 flex w-72 max-w-[18rem] flex-col gap-2 rounded-md p-3 text-popover-foreground shadow-md outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.18)",
            }}
          >
            <div
              className="font-mono uppercase"
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                color: "var(--text-quiet)",
              }}
            >
              {domain}
            </div>
            <div
              className="serif"
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                fontStyle: citation.quote ? "italic" : "normal",
                color: "var(--text)",
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {citation.quote ? `"${body}"` : body}
            </div>
            {statusMeta && (
              <div
                className="flex items-center gap-1.5 font-mono uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: "var(--text-faint)",
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: statusMeta.color }}
                />
                {statusMeta.label}
              </div>
            )}
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 self-start hover:underline"
              style={{
                fontSize: 11,
                color: "var(--text-soft)",
                marginTop: 2,
              }}
            >
              Open source <span aria-hidden>→</span>
            </a>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// Trail of [n] supers appended at the end of a string of prose. Filters out
// citations without URLs (inferred claims live on data.claims, not here).
export function CitationsTrail({ citations }: { citations: Citation[] }) {
  const cited = citations.filter((c) => c?.url);
  if (cited.length === 0) return null;
  return (
    <>
      {cited.map((c) => (
        <CitationSup key={c.id} citation={c} />
      ))}
    </>
  );
}
