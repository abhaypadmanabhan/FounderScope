// Section 5 — Funding Journey: round timeline, investors, milestones.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, Citation } from "./types";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";

const outputSchema = z.object({
  rounds: z.array(
    z.object({
      round_type: z.string(),
      date: z.string(),
      amount_usd: z.number().nullable(),
      valuation_usd: z.number().nullable(),
      lead_investors: z.array(z.string()),
      all_investors: z.array(z.string()),
    })
  ),
  total_raised_usd: z.number().nullable(),
  milestones: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      kind: z.enum(["product", "customer", "hire", "pivot", "press", "other"]),
    })
  ),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;

const Renderer: React.FC<{ data: Output; citations: Citation[] }> = ({ data }) =>
  React.createElement(
    "pre",
    { className: "text-xs whitespace-pre-wrap rounded-md bg-muted p-3" },
    JSON.stringify(data, null, 2)
  );

const SkeletonRenderer: React.FC = () =>
  React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(Skeleton, { className: "h-4 w-3/4" }),
    React.createElement(Skeleton, { className: "h-4 w-1/2" }),
    React.createElement(Skeleton, { className: "h-4 w-5/6" })
  );

export const funding: SectionDefinition<Output> = {
  key: "funding",
  title: "Funding Journey",
  order: 5,
  cacheTtlDays: 14,
  schemaVersion: 2,
  model: DEFAULT_MODEL,
  webSearchVersion: DEFAULT_WEB_SEARCH,
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "Funding history",
      sectionInstructions: `Research the funding history of ${c.name}. Sources: Crunchbase public pages, SEC filings (Form D), TechCrunch, news.

Bootstrapped, pre-seed, or stealth companies may legitimately have rounds: []. That's a finding, not a failure. When rounds is empty, set total_raised_usd: null and add a milestones[] entry with kind: "other" describing the funding posture (e.g. "Bootstrapped — no disclosed external funding as of YYYY-MM" or "Pre-seed YC W25 batch, round details undisclosed"). Never estimate funding amounts. amount_usd: null is mandatory when undisclosed; do not guess from headcount or news framing.

For each round:
- round_type (e.g. "Seed", "Series A").
- date (ISO date or "YYYY-MM").
- amount_usd, valuation_usd (null if undisclosed).
- lead_investors, all_investors.

total_raised_usd: sum across known rounds, or null if too uncertain or no rounds disclosed.

milestones: 3-7 product/customer/hire/pivot/press dates that contextualize the funding timeline. For early-stage companies with little history, fewer milestones (or just one — the founding) is fine.

Cite every round amount and investor with a real URL in claims. Round info inferred from secondary signals (e.g. "Series A inferred from sudden 30→90 headcount jump on LinkedIn"): citation_url/quote: null, inferred: true.`,
      schema: outputSchema,
      example: {
        rounds: [
          {
            round_type: "Seed",
            date: "2013-04",
            amount_usd: 2000000,
            valuation_usd: null,
            lead_investors: ["First Round Capital"],
            all_investors: ["First Round Capital", "Aaron Levie", "Ron Conway"],
          },
          {
            round_type: "Series A",
            date: "2017-04",
            amount_usd: 18000000,
            valuation_usd: null,
            lead_investors: ["Index Ventures"],
            all_investors: ["Index Ventures", "First Round Capital"],
          },
          {
            round_type: "Series C",
            date: "2021-10",
            amount_usd: 275000000,
            valuation_usd: 10000000000,
            lead_investors: ["Sequoia Capital", "Coatue"],
            all_investors: ["Sequoia Capital", "Coatue", "Index Ventures"],
          },
        ],
        total_raised_usd: 343000000,
        milestones: [
          { date: "2016-03", label: "Notion 1.0 public launch", kind: "product" },
          { date: "2018-03", label: "Notion 2.0 launch with database blocks", kind: "product" },
          { date: "2021-10", label: "Reaches $10B valuation", kind: "press" },
        ],
        claims: [
          {
            id: 1,
            text: "Notion raised a $275M Series C at a $10B valuation in October 2021.",
            citation_url:
              "https://techcrunch.com/2021/10/08/notion-raises-275m-at-a-10b-valuation/",
            citation_quote:
              "Notion has raised $275 million in a Series C round at a $10 billion valuation.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
