import type { ResearchEvalOutput } from "../types";

/** Minimal early-stage research output for scorer unit tests (no API calls). */
export const earlyStageFixture: ResearchEvalOutput = {
  company: {
    name: "Resend",
    domain: "resend.com",
    maturity: "early-stage",
  },
  sections: [
    {
      sectionKey: "snapshot",
      content: {
        summary: "Email API for developers.",
        tagline: "Email for developers",
        business_model: "B2B",
        industry: "Developer Tools",
        stage: "Seed",
        hq: "San Francisco, CA",
        founded_year: 2022,
        employee_count_band: "11-50",
        claims: [
          {
            id: 1,
            text: "Resend was founded in 2022.",
            citation_url: "https://www.ycombinator.com/companies/resend",
            citation_quote: "Resend — YC W23",
          },
          {
            id: 2,
            text: "Resend is based in San Francisco.",
            citation_url: null,
            citation_quote: null,
            inferred: true,
          },
        ],
      },
      citations: [
        {
          id: 1,
          url: "https://www.ycombinator.com/companies/resend",
          quote: "Resend — YC W23",
          claim: "Resend was founded in 2022.",
          status: "resolved",
        },
        {
          id: 2,
          url: "https://example.com/dead-page",
          quote: "nowhere",
          claim: "Bad link",
          status: "dead",
        },
      ],
    },
    {
      sectionKey: "tech_stack",
      content: {
        current_stack: {
          frontend: ["React"],
          backend: ["Node.js"],
          database: ["PostgreSQL"],
          infra: ["Vercel"],
          vendors: [],
        },
        mvp_stack: {
          frontend: ["React"],
          backend: ["Node.js"],
          database: ["PostgreSQL"],
          infra: ["Vercel"],
          vendors: [],
        },
        mvp_cost_estimate: {
          team_low_usd: 100_000,
          team_high_usd: 200_000,
          infra_low_usd: 1_000,
          infra_high_usd: 5_000,
          other_low_usd: 0,
          other_high_usd: 0,
          total_low_usd: 101_000,
          total_high_usd: 205_000,
          methodology: "Estimate",
        },
        stack_evolution: "Lean MVP stack.",
        claims: [
          {
            id: 1,
            text: "Uses TypeScript.",
            citation_url: "https://github.com/resend",
            citation_quote: "TypeScript repo",
          },
        ],
      },
      citations: [
        {
          id: 1,
          url: "https://github.com/resend",
          quote: "TypeScript repo",
          claim: "Uses TypeScript.",
          status: "resolved",
        },
        {
          id: 3,
          url: "https://random-blog.com/post",
          quote: "off allowlist",
          claim: "Off list",
          status: "resolved",
        },
      ],
    },
  ],
};

/** Enterprise fixture with SEC/IR citations. */
export const enterpriseFixture: ResearchEvalOutput = {
  company: {
    name: "Stripe",
    domain: "stripe.com",
    maturity: "enterprise",
  },
  sections: [
    {
      sectionKey: "funding",
      content: {
        rounds: [
          {
            round_type: "Series I",
            date: "2023-03-01",
            amount_usd: 6_500_000_000,
            valuation_usd: null,
            lead_investors: ["Sequoia"],
            all_investors: ["Sequoia", "Andreessen Horowitz"],
          },
        ],
        total_raised_usd: 8_000_000_000,
        milestones: [],
        claims: [
          {
            id: 1,
            text: "Stripe filed SEC disclosures.",
            citation_url: "https://www.sec.gov/edgar/browse/?CIK=0001637810",
            citation_quote: "SEC filing",
          },
        ],
      },
      citations: [
        {
          id: 1,
          url: "https://www.sec.gov/edgar/browse/?CIK=0001637810",
          quote: "SEC filing",
          claim: "Stripe filed SEC disclosures.",
          status: "resolved",
        },
      ],
    },
  ],
};
