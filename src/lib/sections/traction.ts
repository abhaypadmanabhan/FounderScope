// Section 6 — Traction: ARR, headcount, web traffic with data-quality badges.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, Citation } from "./types";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";

const outputSchema = z.object({
  arr_estimate: z.object({
    low_usd: z.number().nullable(),
    high_usd: z.number().nullable(),
    as_of: z.string().nullable(),
    confidence: z.enum(["confirmed", "estimated", "unknown"]),
    source: z.string().nullable(),
  }),
  headcount_history: z.array(
    z.object({
      date: z.string(),
      count: z.number().int(),
      confidence: z.enum(["confirmed", "estimated"]),
    })
  ),
  web_traffic_trend: z.enum(["up", "flat", "down", "unknown"]),
  web_traffic_note: z.string(),
  other_signals: z.array(z.string()),
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

export const traction: SectionDefinition<Output> = {
  key: "traction",
  title: "Traction",
  order: 6,
  cacheTtlDays: 7,
  schemaVersion: 2,
  model: DEFAULT_MODEL,
  webSearchVersion: DEFAULT_WEB_SEARCH,
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "Traction signals",
      sectionInstructions: `Research traction signals for ${c.name}.

ARR: prefer Sacra, Contrary Research, news leaks, S-1 if public. Mark confidence honestly:
  - "confirmed" only when company-stated or public filing.
  - "estimated" for analyst estimates.
  - "unknown" if no reliable source.

headcount_history: LinkedIn proxy via aggregators or Wayback. Confidence "confirmed" or "estimated".

web_traffic_trend: rough direction only.

other_signals: app store ranks, GitHub stars, anything public.

If a metric has no reliable source, mark confidence 'unknown' and explain in source field. Do NOT fabricate numbers.`,
      schema: outputSchema,
      example: {
        arr_estimate: {
          low_usd: 100000000,
          high_usd: 150000000,
          as_of: "2024-08",
          confidence: "estimated",
          source:
            "Sacra estimate based on customer count and reported $20/user/month plan ARPU.",
        },
        headcount_history: [
          { date: "2023-03", count: 30, confidence: "estimated" },
          { date: "2024-03", count: 80, confidence: "estimated" },
          { date: "2024-09", count: 150, confidence: "estimated" },
        ],
        web_traffic_trend: "up",
        web_traffic_note:
          "Similarweb shows ~3x YoY growth on cursor.com in 2024, peaking after the launch of Composer/Tab features.",
        other_signals: [
          "Top of HN homepage repeatedly through 2024",
          "Reported 40k+ paying users by mid-2024",
          "Mentioned by name in OpenAI/Anthropic launch demos",
        ],
        claims: [
          {
            id: 1,
            text: "Cursor was estimated at $100-150M ARR by mid-2024.",
            citation_url: "https://sacra.com/c/cursor/",
            citation_quote:
              "Cursor reached an estimated $100M+ in ARR by August 2024.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
