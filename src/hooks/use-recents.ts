"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type RecentEntry = {
  slug: string;
  display_name: string;
  searched_at: string;
};

export function useRecents() {
  const pathname = usePathname();
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/search-history", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: RecentEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      // Network error — keep stale entries; sidebar will retry on next nav.
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("recents:updated", handler);
    return () => window.removeEventListener("recents:updated", handler);
  }, [refresh, pathname]);

  return { entries, refresh };
}
