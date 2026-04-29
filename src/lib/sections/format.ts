// Tiny formatting helpers shared across renderers.

export function padOrder(order: number): string {
  return order.toString().padStart(2, "0");
}

// Compact USD with K/M/B suffix. 240000 → "$240K", 1500000 → "$1.5M".
// Drops trailing zero past the decimal: 250000 → "$250K", not "$250.0K".
export function formatUsdCompact(n: number): string {
  const fmt = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return `$${fmt.format(n)}`;
}

// "$2M – $4M" with en-dash, italic placeholder when both null.
export function formatUsdRange(low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  if (low != null && high != null && low === high) return formatUsdCompact(low);
  if (low != null && high != null) return `${formatUsdCompact(low)} – ${formatUsdCompact(high)}`;
  return formatUsdCompact((low ?? high) as number);
}

// "2021-10" or "2021-10-08" → "Oct 2021". Bare "2021" passes through.
export function formatYearMonth(s: string): string {
  if (/^\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return s;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return s;
  return `${months[idx]} ${m[1]}`;
}
