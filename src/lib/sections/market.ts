// Section 7 — Market & Competition: TAM/SAM/SOM rings, competitors, pioneer verdict.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";

const outputSchema = z.object({
  tam_usd: z.number().nullable(),
  sam_usd: z.number().nullable(),
  som_usd: z.number().nullable(),
  market_size_source: z.string(),
  market_size_confidence: z.enum(["analyst", "company_stated", "our_estimate", "unknown"]),
  pioneer_or_follower: z.enum(["pioneer", "fast_follower", "follower", "unclear"]),
  pioneer_reasoning: z.string(),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string().nullable(),
        positioning: z.string(),
      })
    )
    .min(0)
    .max(6),
  category_growth_rate: z.string(),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;

const Renderer: React.FC<RendererProps<Output>> = ({ data }) =>
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

export const market: SectionDefinition<Output> = {
  key: "market",
  title: "Market & Competition",
  order: 7,
  cacheTtlDays: 14,
  schemaVersion: 2,
  model: DEFAULT_MODEL,
  webSearchVersion: DEFAULT_WEB_SEARCH,
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "Market and competitive landscape",
      sectionInstructions: `Research the market and competitive landscape for ${c.name}.

TAM/SAM/SOM with explicit source attribution — analyst report, company pitch, or your own estimate. Mark market_size_confidence appropriately:
  - "analyst" for third-party analyst reports.
  - "company_stated" if from the company.
  - "our_estimate" if you derived it.
  - "unknown" if no defensible figure.

pioneer_or_follower: pick one with a one-paragraph reason in pioneer_reasoning.

competitors: 0-6 named competitors, each with one-line positioning vs ${c.name}. If there are no direct competitors (truly novel category or too early-stage to have any), return competitors: [] and explain in pioneer_reasoning what makes the category novel and what adjacent alternatives exist. "No competitors" without pioneer_reasoning is a red flag, not a moat — earn the empty array with substance.

category_growth_rate: e.g. "~25% CAGR" or "unknown".

Cite every market size figure and competitor claim with a real URL in claims.`,
      schema: outputSchema,
      example: {
        tam_usd: 50000000000,
        sam_usd: 12000000000,
        som_usd: 2000000000,
        market_size_source:
          "Gartner 2024 estimate of the design + collaboration software market.",
        market_size_confidence: "analyst",
        pioneer_or_follower: "pioneer",
        pioneer_reasoning:
          "Figma was the first to put production-grade vector design in a browser with multiplayer editing. Sketch had the desktop UX, InVision had the handoff workflow, but Figma collapsed both into one tool with real-time collaboration as the default. Every collaborative design tool launched after 2018 is downstream of that bet.",
        competitors: [
          {
            name: "Sketch",
            domain: "sketch.com",
            positioning:
              "Mac-native incumbent. Faster on local hardware but no browser, weaker collaboration story.",
          },
          {
            name: "Adobe XD",
            domain: "adobe.com",
            positioning:
              "Bundled with Creative Cloud. Lost momentum after Adobe's Figma acquisition was abandoned.",
          },
          {
            name: "Penpot",
            domain: "penpot.app",
            positioning:
              "Open-source, self-hostable. Niche traction with regulated/security-conscious teams.",
          },
        ],
        category_growth_rate: "~15% CAGR",
        claims: [
          {
            id: 1,
            text: "Figma was acquired by Adobe in a deal that was later abandoned in December 2023.",
            citation_url:
              "https://www.adobe.com/news-room/news/202312/adobeandfigmamutuallyagreetoterminatemergeragreement.html",
            citation_quote:
              "Adobe and Figma have mutually agreed to terminate the proposed merger.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
