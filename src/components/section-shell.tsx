// Reusable section header chrome: [n]  EYEBROW  ──────────
//
// width prop decouples prose-readable line length from layout-canvas usage.
//   "prose" (default) — children constrained to ~680px so paragraphs read.
//   "wide"            — children get the full layout canvas (~1080px) for
//                       structured data: timelines, grids, charts, bands.
//
// The header rule always spans the full canvas regardless of width.
// Inside a wide section, individual prose blocks are responsible for their
// own .prose-col wrapping where appropriate.
import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  n: string;
  width?: "prose" | "wide";
  children: ReactNode;
}

export function SectionShell({ eyebrow, n, width = "prose", children }: Props) {
  return (
    <section className="mb-[88px]">
      <div className="flex items-center gap-2.5 mb-[22px]">
        <span
          aria-hidden
          className="h-3.5 w-0.5 shrink-0"
          style={{ background: "var(--accent-color)" }}
        />
        <span
          className="font-mono"
          style={{ fontSize: 11, color: "var(--text)", letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}
        >
          {n}
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-quiet)" }}>
          /
        </span>
        <span className="eyebrow">{eyebrow}</span>
        <span className="flex-1 h-px" style={{ background: "var(--border-faint)" }} />
      </div>
      {width === "prose" ? (
        <div style={{ maxWidth: 680 }}>{children}</div>
      ) : (
        children
      )}
    </section>
  );
}
