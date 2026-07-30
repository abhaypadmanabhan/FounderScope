import type { Citation } from "@/lib/sections/types";

/** Dead-link rate from citation statuses (no network I/O). */
export function deadLinkRate(citations: Citation[]): number | null {
  if (citations.length === 0) return null;
  const dead = citations.filter((c) => c.status === "dead").length;
  return dead / citations.length;
}

export function aggregateDeadLinkRate(
  sections: Array<{ citations: Citation[] }>
): number | null {
  const all = sections.flatMap((s) => s.citations);
  return deadLinkRate(all);
}
