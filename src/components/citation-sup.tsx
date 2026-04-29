// Shared citation superscript. Click-to-open. Future popover slice swaps internals here.
"use client";

import type { Citation } from "@/lib/sections/types";

export function CitationSup({ citation }: { citation: Citation }) {
  return (
    <sup
      className="cite"
      title={citation.quote || citation.claim}
      onClick={(e) => {
        e.preventDefault();
        if (typeof window !== "undefined") {
          window.open(citation.url, "_blank", "noopener");
        }
      }}
    >
      {citation.id}
    </sup>
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
