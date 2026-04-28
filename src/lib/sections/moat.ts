// Section 2 — Moat & Replicability: hero section. Opinionated synthesis for technical founders.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, Citation } from "./types";
import { REASONING_MODEL, REASONING_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";

const confidenceEnum = z.enum(["high", "medium", "low"]);

const outputSchema = z.object({
  moat_types: z.array(
    z.enum([
      "data",
      "network_effects",
      "distribution",
      "brand",
      "regulatory",
      "switching_costs",
      "scale_economies",
      "none",
    ])
  ),
  moat_summary: z.string(),
  compounding_moments: z
    .array(
      z.object({
        year: z.number().int(),
        what_happened: z.string(),
        why_it_compounded: z.string(),
        citation_url: z.string().url().nullable(),
        inferred: z.boolean().default(false),
      })
    )
    .min(0)
    .max(5),
  replicability: z.object({
    data_score: z.number().int().min(1).max(10),
    network_score: z.number().int().min(1).max(10),
    distribution_score: z.number().int().min(1).max(10),
    regulatory_score: z.number().int().min(1).max(10),
    reasoning: z.object({
      data: z.string(),
      network: z.string(),
      distribution: z.string(),
      regulatory: z.string(),
    }),
    confidence: z.object({
      data: confidenceEnum,
      network: confidenceEnum,
      distribution: confidenceEnum,
      regulatory: confidenceEnum,
    }),
  }),
  defensible: z.string(),
  overrated: z.string(),
  attack_vector: z.string(),
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

export const moat: SectionDefinition<Output> = {
  key: "moat",
  title: "Moat & Replicability",
  order: 2,
  cacheTtlDays: 30,
  schemaVersion: 2,
  model: REASONING_MODEL,
  webSearchVersion: REASONING_WEB_SEARCH,
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "MOAT analysis",
      sectionInstructions: `Produce a MOAT analysis for ${c.name} for an audience of technical founders considering whether they could realistically compete.

You are NOT writing for an investor pitch. You are writing for a builder who has Claude Code, six months, and the willingness to focus. Your job is to take a position, not hedge.

MOAT TYPES — pick all that apply. 'none' is a valid answer for companies whose moat is mostly hype.

COMPOUNDING MOMENTS — 0 to 5 specific events with years that made the moat real. Not 'launched product' — 'shipped X which created Y data asset that competitors now can't reproduce because Z'. Compounding moments without verifiable sources are still valid: set citation_url: null, inferred: true, and explain in why_it_compounded what the evidence basis is (e.g. 'observable from public hiring patterns', 'inferred from changelog history'). Empty array is also valid for companies too young to have compounding moments yet — explain why in moat_summary (e.g. 'founded 2025, pre-product, no compounding events to assess yet'). Never invent a URL; null + inferred=true is honest, fabricated URLs are not.

REPLICABILITY SCORES — score 1-10 on each axis with a confidence rating. Lower score = easier to replicate. Rubric:
  - data (30% weight): is the proprietary data hard to reproduce?
    1 = trivial public data. 10 = decades of unique behavioral data that requires platform scale to collect.
  - network (30%): does each user make the product more valuable for the next?
    1 = no network effect. 10 = global liquidity network like Visa.
  - distribution (20%): durable GTM advantage?
    1 = paid ads only. 10 = embedded in OS, browser, or default workflow.
  - regulatory (20%): license, capital, or compliance barriers?
    1 = none. 10 = bank charter, FDA approval, telecom license.
    Score the regulatory axis honestly. If no regulatory moat exists (unregulated category, pre-revenue, too early to attract regulation), score 1-2 with confidence: "high" and reasoning that says so plainly. Don't conflate "no moat" with "low confidence" — they're different signals. A confident 2 means "I am sure there is no regulatory barrier here". A "low" confidence on this axis means "I'm not sure whether there's a barrier", which is different.

Confidence semantics for ALL axes:
  - "high" = enough public signal to be confident in the score (either way — a confident 2 is fine).
  - "medium" = some signal, some judgment call.
  - "low" = sparse data, score is mostly inference. Common for very early-stage companies.

Be willing to score companies low (3-4) even if they're famous. Most 'unicorns' are in the 4-6 range honestly.

For each axis include 1-2 sentences of reasoning citing the specific facts that drove the score, plus an explicit confidence value.

DEFENSIBLE / OVERRATED / ATTACK_VECTOR — opinionated paragraphs (required).
'defensible' = what genuinely cannot be copied.
'overrated' = what looks hard but a focused team could replicate in months.
'attack_vector' = if you were going to compete, where would you actually attack? Pick ONE angle and commit. Don't list five options. The attack MUST exploit a structural weakness specific to THIS company — not a generic category play like 'go vertical' that applies to any horizontal platform. Name the architectural decision, organizational constraint, or market gap that makes this company specifically vulnerable, and explain why they can't easily close it.

CLAIMS — every concrete fact (founding year, key customer, technical detail, market share number) gets a claim entry. Set citation_url and citation_quote when you have a real retrieved source; otherwise set them to null and inferred: true.`,
      schema: outputSchema,
      example: {
        moat_types: ["distribution", "switching_costs"],
        moat_summary:
          "Stripe's real moat is the API surface area built since 2011 and the integration debt baked into thousands of codebases. Brand and developer goodwill are downstream of that.",
        compounding_moments: [
          {
            year: 2011,
            what_happened: "Public launch of the seven-line checkout API.",
            why_it_compounded:
              "Set the developer-experience bar globally; every payments doc since gets compared to Stripe's. Created a hiring magnet for fintech engineers.",
            citation_url: "https://stripe.com/blog/stripe-launch",
            inferred: false,
          },
          {
            year: 2014,
            what_happened: "Stripe quietly accumulates a fraud-signal corpus large enough to power Radar.",
            why_it_compounded:
              "No single launch announcement, but inferred from Radar's GA in 2016 — the model only works because Stripe had years of cross-merchant fraud data already in flight by then. Competitors entering payments today can't backfill that timeline.",
            citation_url: null,
            inferred: true,
          },
          {
            year: 2021,
            what_happened: "Stripe Treasury and Issuing GA.",
            why_it_compounded:
              "Turned Stripe from a pipe into the system of record. Pulling Treasury out is a migration project, not a swap.",
            citation_url:
              "https://stripe.com/blog/treasury-and-issuing-general-availability",
            inferred: false,
          },
        ],
        replicability: {
          data_score: 5,
          network_score: 4,
          distribution_score: 8,
          regulatory_score: 6,
          reasoning: {
            data:
              "Fraud signals across millions of merchants are real but Adyen and PayPal have comparable surfaces. Not unreproducible.",
            network:
              "Mostly one-sided. Radar gets sharper with volume, but a user joining doesn't make checkout better for the next user.",
            distribution:
              "Default for indie devs and YC. That's a brand+integration moat measured in years, not months.",
            regulatory:
              "State money transmitter licenses required in all 50 US states under individual state statutes (e.g. NY BitLicense, CA Money Transmission Act). Stripe also holds an Irish e-money license from the Central Bank of Ireland. Real but well-trodden — Adyen, Marqeta have done the same.",
          },
          confidence: {
            data: "medium",
            network: "high",
            distribution: "high",
            regulatory: "low",
          },
        },
        defensible:
          "The integration footprint. Tens of thousands of codebases have Stripe SDKs wired into checkout, billing, webhooks, and reconciliation. Ripping that out costs an engineering quarter no PM wants to sign off on.",
        overrated:
          "The 'best docs in fintech' brand. Docs are a six-month project for a focused team. The reason nobody catches up is everyone re-builds the platform first instead of just shipping the docs.",
        attack_vector:
          "Stripe's API-first model means the merchant owns the checkout page — Stripe never sees the buyer. Attack by owning the buyer relationship end-to-end (like Shop Pay for Shopify). Build an embedded checkout that captures buyer identity and purchase history across merchants. Stripe can't follow because adding a buyer-facing product would alienate the developer audience that chose them specifically for staying invisible.",
        claims: [
          {
            id: 1,
            text: "Stripe launched its public API in 2011.",
            citation_url: "https://stripe.com/blog/stripe-launch",
            citation_quote: "Today we're launching Stripe.",
          },
          {
            id: 2,
            text: "Stripe Atlas launched in 2016 to help founders incorporate.",
            citation_url: "https://stripe.com/atlas",
            citation_quote: "Stripe Atlas helps you launch your startup from anywhere in the world.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
