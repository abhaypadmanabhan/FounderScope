// Section 1 — Snapshot: company summary, tags, logo header card.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps, Citation } from "./types";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";
import { SectionShell } from "@/components/section-shell";
import { CompanyLogo } from "@/components/company-logo";
import { CitationsTrail } from "@/components/citation-sup";
import { padOrder } from "@/lib/sections/format";

const outputSchema = z.object({
  summary: z.string(),
  tagline: z.string(),
  // Models occasionally drift outside the enum (e.g. "50-200", "Late stage", a custom
  // bucket). Don't fail the whole section over a tag. .catch maps any unrecognized value
  // to a safe fallback the renderer already treats specially.
  business_model: z
    .enum(["B2B", "B2C", "B2B2C", "B2G", "Marketplace", "Other"])
    .catch("Other"),
  industry: z.string(),
  stage: z
    .enum([
      "Seed",
      "Series A",
      "Series B",
      "Series C",
      "Series D+",
      "Growth",
      "Public",
      "Acquired",
      "Bootstrapped",
      "Unknown",
    ])
    .catch("Unknown"),
  hq: z.string().nullable(),
  founded_year: z.number().int().nullable(),
  employee_count_band: z
    .enum([
      "1-10",
      "11-50",
      "51-200",
      "201-500",
      "501-1000",
      "1001-5000",
      "5001-10000",
      "10000+",
      "Unknown",
    ])
    .catch("Unknown"),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;

const Renderer: React.FC<RendererProps<Output>> = ({ data, citations, company, section }) => {
  const meta = buildMetaPairs(data);
  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)} width="wide">
      <div
        className="grid items-start gap-x-12 gap-y-8 mb-10 grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <div className="flex items-start gap-6">
          <CompanyLogo name={company.display_name} domain={company.domain} size={96} />
          <div className="flex-1 min-w-0 pt-1">
            <h1
              className="h-display m-0"
              style={{
                color: "var(--text)",
                marginBottom: 8,
                fontSize: 56,
                lineHeight: 1.02,
              }}
            >
              {company.display_name}
            </h1>
            {data.tagline && (
              <div
                className="italic"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 18,
                  fontFamily: "var(--font-serif)",
                  lineHeight: 1.4,
                }}
              >
                {data.tagline}
              </div>
            )}
          </div>
        </div>
        {meta.length > 0 && (
          <dl
            className="m-0"
            style={{
              borderTop: "1px solid var(--border-faint)",
              borderBottom: "1px solid var(--border-faint)",
            }}
          >
            {meta.map((m, i) => (
              <div
                key={m.label}
                className="grid items-baseline"
                style={{
                  gridTemplateColumns: "96px 1fr",
                  gap: 14,
                  padding: "9px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                }}
              >
                <dt
                  className="micro"
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.13em",
                    color: "var(--text-faint)",
                    fontWeight: 500,
                    fontSize: 11,
                  }}
                >
                  {m.label}
                </dt>
                <dd
                  className="m-0"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 15,
                    color: "var(--text)",
                    lineHeight: 1.4,
                  }}
                >
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <p className="lead" style={{ maxWidth: 720, margin: 0 }}>
        {renderWithCitations(data.summary, citations)}
      </p>
    </SectionShell>
  );
};

const SkeletonRenderer: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-4 w-5/6" />
  </div>
);

function buildMetaPairs(d: Output): { label: string; value: string }[] {
  const pairs: { label: string; value: string }[] = [];
  if (d.industry) pairs.push({ label: "Industry", value: d.industry });
  if (d.business_model && d.business_model !== "Other") {
    pairs.push({ label: "Model", value: d.business_model });
  }
  if (d.stage && d.stage !== "Unknown") pairs.push({ label: "Stage", value: d.stage });
  if (d.founded_year) pairs.push({ label: "Founded", value: String(d.founded_year) });
  if (d.employee_count_band && d.employee_count_band !== "Unknown") {
    pairs.push({ label: "Headcount", value: `~${d.employee_count_band}` });
  }
  if (d.hq) pairs.push({ label: "HQ", value: d.hq });
  return pairs;
}

// Append [n] superscripts at the end of the summary for each cited claim.
function renderWithCitations(text: string, citations: Citation[]): React.ReactNode {
  return (
    <>
      {text}
      <CitationsTrail citations={citations} />
    </>
  );
}

export const snapshot: SectionDefinition<Output> = {
  key: "snapshot",
  title: "Snapshot",
  order: 1,
  cacheTtlDays: 30,
  schemaVersion: 2,
  model: DEFAULT_MODEL,
  webSearchVersion: DEFAULT_WEB_SEARCH,
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "SNAPSHOT report",
      sectionInstructions: `Produce a SNAPSHOT report for ${c.name}.
- summary: 2-3 sentences on what the company actually builds, who pays for it, and how they make money. Be specific — name the product or service, the customer segment, and the revenue model. Do NOT restate the company's marketing tagline or mission statement. Cite from third-party coverage (news, analysts, Wikipedia) where available. For early-stage companies (months old, stealth, pre-launch) the company's own About page or founder Twitter/LinkedIn may be the only source — that's fine, just be specific about product/customer/revenue model. Never fabricate.
- tagline: under 12 words. Describe what they DO, not what they aspire to.
- hq, founded_year, employee_count_band: use the company's own site or LinkedIn for these.
- claims: every concrete factual statement gets one entry. Prefer third-party sources (news, Wikipedia, SEC filings, LinkedIn) when they exist. For pre-launch or stealth companies the only source may be the company's own site — cite it; that is preferable to fabricating a third-party URL. If a claim is observed-but-unsourced (e.g. inferred from product page structure), set citation_url and citation_quote to null and inferred: true.`,
      schema: outputSchema,
      example: {
        summary:
          "Stripe sells payment-processing APIs to online businesses, taking ~2.9% + $0.30 per transaction. Primary customers range from YC startups to enterprises like Amazon and Shopify. Also offers billing, invoicing, fraud detection (Radar), and banking-as-a-service (Treasury, Issuing).",
        tagline: "Payment-processing APIs for internet businesses.",
        business_model: "B2B",
        industry: "Fintech / Payments",
        stage: "Public",
        hq: "San Francisco, CA",
        founded_year: 2010,
        employee_count_band: "5001-10000",
        claims: [
          {
            id: 1,
            text: "Stripe was founded in 2010 by Patrick and John Collison.",
            citation_url: "https://en.wikipedia.org/wiki/Stripe,_Inc.",
            citation_quote:
              "Stripe, Inc. is an Irish-American multinational financial services and software as a service company... founded in 2010 by Irish brothers John and Patrick Collison.",
          },
          {
            id: 2,
            text: "Stripe is headquartered in San Francisco, California.",
            citation_url: "https://stripe.com/about",
            citation_quote: "Headquartered in San Francisco and Dublin.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
