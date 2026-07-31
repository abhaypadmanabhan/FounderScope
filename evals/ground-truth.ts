import type { GroundTruth } from "./types";

/**
 * Sourced ground truth for the golden set, keyed by `GoldenCompany.domain`.
 *
 * A company with no entry — or an entry missing a field — is simply not graded
 * for accuracy on it. Curation therefore never has to choose between guessing
 * and blocking: omit the fact and the scorer stays silent about it.
 *
 * Every fact here survived `node scripts/verify-ground-truth.mjs`, which fetches
 * each cited page and checks that the value actually appears on it. Run that
 * script after any edit. The first curation pass reported auditing every fact
 * against its URL while 21 of 49 were not substantiated by the page cited —
 * including a founding year cited to a bare homepage and a country inferred from
 * a pun in a tagline. Values that read as plausible are exactly the ones that
 * survive review, so the check has to be mechanical rather than editorial.
 *
 * Deliberately sparse. Coverage was traded for trust: a founding year that no
 * cited page states is worse than no founding year, because it grades the
 * product against a number nobody can check.
 */
export const GROUND_TRUTH: GroundTruth = {
  "resend.com": {
    foundedYear: {
      value: 2023,
      source: "https://resend.com/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
    hqCountry: {
      value: "US",
      source: "https://www.ycombinator.com/companies/resend",
      asOf: "2026-07-30",
      tier: "secondary",
    },
    latestFunding: {
      value: {
        stage: "Series A",
        amountUsd: 18_000_000,
        announced: "2024-12-04",
        leadInvestor: "Andreessen Horowitz",
      },
      source: "https://resend.com/blog/series-a",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "trigger.dev": {
    hqCountry: {
      value: "GB",
      source: "https://trigger.dev/legal/privacy",
      asOf: "2026-07-30",
      tier: "primary",
    },
    latestFunding: {
      value: {
        stage: "Series A",
        amountUsd: 16_000_000,
        leadInvestor: null,
      },
      source: "https://trigger.dev/blog/series-a",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "plane.so": {
    foundedYear: {
      value: 2022,
      source: "https://plane.so/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
    hqCountry: {
      value: "US",
      source: "https://plane.so/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "inngest.com": {
    hqCountry: {
      value: "US",
      source: "https://inngest.com/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "turso.tech": {
    hqCountry: {
      value: "US",
      source: "https://turso.tech/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "lovable.dev": {
    latestFunding: {
      value: {
        stage: "Series B",
        amountUsd: 330_000_000,
        announced: "2025-12-18",
        leadInvestor: "CapitalG",
      },
      source: "https://lovable.dev/blog/series-b",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "mintlify.com": {
    foundedYear: {
      value: 2022,
      source: "https://mintlify.com/blog/series-b",
      asOf: "2026-07-30",
      tier: "primary",
    },
    latestFunding: {
      value: {
        stage: "Series B",
        amountUsd: 45_000_000,
        leadInvestor: null,
      },
      source: "https://mintlify.com/blog/series-b",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "stripe.com": {
    hqCountry: {
      value: "US",
      source: "https://stripe.com/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
    latestFunding: {
      // The page says "more than $6.5 billion". Curation recorded $650M — a 10x
      // magnitude error that the ±10% amount tolerance would have scored as a
      // product failure on every run.
      value: {
        stage: "Series I",
        amountUsd: 6_500_000_000,
        leadInvestor: null,
      },
      source: "https://stripe.com/newsroom/news/stripe-series-i",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "anthropic.com": {
    hqCountry: {
      value: "US",
      source: "https://www.anthropic.com/company",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "microsoft.com": {
    hqCountry: {
      value: "US",
      source: "https://www.microsoft.com/en-us/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
    ticker: {
      value: { symbol: "MSFT", exchange: "Nasdaq" },
      source: "https://www.sec.gov/files/company_tickers_exchange.json",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "apple.com": {
    hqCountry: {
      value: "US",
      source: "https://www.apple.com/about/",
      asOf: "2026-07-30",
      tier: "primary",
    },
    ticker: {
      value: { symbol: "AAPL", exchange: "Nasdaq" },
      source: "https://www.sec.gov/files/company_tickers_exchange.json",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "salesforce.com": {
    foundedYear: {
      value: 1999,
      source: "https://www.salesforce.com/company/our-story/",
      asOf: "2026-07-30",
      tier: "primary",
    },
    hqCountry: {
      value: "US",
      source: "https://www.salesforce.com/company/our-story/",
      asOf: "2026-07-30",
      tier: "primary",
    },
    ticker: {
      value: { symbol: "CRM", exchange: "NYSE" },
      source: "https://www.sec.gov/files/company_tickers_exchange.json",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "shopify.com": {
    hqCountry: {
      value: "CA",
      source: "https://www.shopify.com/about",
      asOf: "2026-07-30",
      tier: "primary",
    },
    ticker: {
      // Curation recorded NYSE. SEC's own exchange mapping says Nasdaq.
      value: { symbol: "SHOP", exchange: "Nasdaq" },
      source: "https://www.sec.gov/files/company_tickers_exchange.json",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "uber.com": {
    // uber.com/newsroom returns HTTP 406 to a plain fetch, so the founding year
    // and HQ cited there cannot be audited. Only the SEC-backed ticker survives.
    ticker: {
      value: { symbol: "UBER", exchange: "NYSE" },
      source: "https://www.sec.gov/files/company_tickers_exchange.json",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },

  "nvidia.com": {
    foundedYear: {
      value: 1993,
      source: "https://www.nvidia.com/en-us/about-nvidia/corporate-timeline/",
      asOf: "2026-07-30",
      tier: "primary",
    },
    hqCountry: {
      value: "US",
      source: "https://www.nvidia.com/en-us/about-nvidia/corporate-timeline/",
      asOf: "2026-07-30",
      tier: "primary",
    },
    ticker: {
      value: { symbol: "NVDA", exchange: "Nasdaq" },
      source: "https://www.sec.gov/files/company_tickers_exchange.json",
      asOf: "2026-07-30",
      tier: "primary",
    },
  },
};
