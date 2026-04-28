// Slug generation and collision resolution for company URLs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const slugifyLib = require("slugify") as (str: string, opts?: Record<string, unknown>) => string;

export function slugify(name: string): string {
  return slugifyLib(name, { lower: true, strict: true });
}

// Appends a domain-derived hint when the base slug would collide.
// E.g. "stripe" + "stripe.com" → "stripe-com" if "stripe" is taken.
export function resolveCollisionSlug(name: string, domain: string): string {
  const base = slugify(name);
  const domainHint = domain
    .replace(/^www\./, "")
    .replace(/\.[^.]+$/, "") // strip TLD
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase();
  return `${base}-${domainHint}`;
}
