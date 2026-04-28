// Reusable section header chrome: [n]  EYEBROW  ──────────
import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  n: string;
  children: ReactNode;
}

export function SectionShell({ eyebrow, n, children }: Props) {
  return (
    <section className="mb-[88px]">
      <div className="flex items-baseline gap-3 mb-[22px]">
        <span
          className="font-mono"
          style={{ fontSize: 11, color: "var(--text-quiet)", letterSpacing: "0.04em" }}
        >
          {n}
        </span>
        <span className="eyebrow">{eyebrow}</span>
        <span className="flex-1 h-px" style={{ background: "var(--border-faint)" }} />
      </div>
      {children}
    </section>
  );
}
