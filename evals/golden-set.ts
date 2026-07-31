import type { GoldenCompany } from "./types";

/** ~20 companies split 10 early-stage / 10 enterprise for regime-specific regression signal. */
export const GOLDEN_SET: GoldenCompany[] = [
  // Early-stage — pre-Series-B, sparsely covered on the open web
  { name: "Resend", domain: "resend.com", maturity: "early-stage" },
  { name: "Dub", domain: "dub.co", maturity: "early-stage" },
  { name: "Cal.com", domain: "cal.com", maturity: "early-stage" },
  { name: "Trigger.dev", domain: "trigger.dev", maturity: "early-stage" },
  { name: "Plane", domain: "plane.so", maturity: "early-stage" },
  { name: "Inngest", domain: "inngest.com", maturity: "early-stage" },
  { name: "Turso", domain: "turso.tech", maturity: "early-stage" },
  { name: "Hono", domain: "hono.dev", maturity: "early-stage" },
  { name: "Polar", domain: "polar.sh", maturity: "early-stage" },
  { name: "SST", domain: "sst.dev", maturity: "early-stage" },
  // Enterprise — Series B+, public companies, or heavy coverage
  { name: "Lovable", domain: "lovable.dev", maturity: "enterprise" },
  { name: "Mintlify", domain: "mintlify.com", maturity: "enterprise" },
  { name: "Stripe", domain: "stripe.com", maturity: "enterprise" },
  { name: "Anthropic", domain: "anthropic.com", maturity: "enterprise" },
  { name: "Microsoft", domain: "microsoft.com", maturity: "enterprise" },
  { name: "Apple", domain: "apple.com", maturity: "enterprise" },
  { name: "Salesforce", domain: "salesforce.com", maturity: "enterprise" },
  { name: "Shopify", domain: "shopify.com", maturity: "enterprise" },
  { name: "Uber", domain: "uber.com", maturity: "enterprise" },
  { name: "Nvidia", domain: "nvidia.com", maturity: "enterprise" },
];

export const EARLY_STAGE_COMPANIES = GOLDEN_SET.filter(
  (c) => c.maturity === "early-stage"
);

export const ENTERPRISE_COMPANIES = GOLDEN_SET.filter(
  (c) => c.maturity === "enterprise"
);
