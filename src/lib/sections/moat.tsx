// Section 2 — Moat & Replicability: hero section. Opinionated synthesis for technical founders.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";
import { SectionShell } from "@/components/section-shell";
import { CitationsTrail } from "@/components/citation-sup";
import { ReplicabilityScore, colorForScore } from "@/components/replicability-score";
import { ReplicabilityRadar, type RadarAxis } from "@/components/replicability-radar";
import { ConfidenceDot, type ConfidenceVariant } from "@/components/confidence-dot";
import { padOrder } from "@/lib/sections/format";

function moatConfidenceToVariant(c: "high" | "medium" | "low"): ConfidenceVariant {
  return c === "high" ? "full" : c === "medium" ? "partial" : "empty";
}

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
  // Top-level section confidence — distinct from the per-axis confidence on
  // replicability above. Optional so legacy fixtures still validate.
  confidence: z.enum(["high", "medium", "low"]).optional(),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;

const MOAT_TYPE_LABELS: Record<string, string> = {
  data: "Data",
  network_effects: "Network effects",
  distribution: "Distribution",
  brand: "Brand",
  regulatory: "Regulatory",
  switching_costs: "Switching costs",
  scale_economies: "Scale economies",
  none: "No moat",
};

// Replicability prompt-stated weights: data 30, network 30, distribution 20, regulatory 20.
function aggregateScore(r: Output["replicability"]): number {
  return (
    0.3 * r.data_score +
    0.3 * r.network_score +
    0.2 * r.distribution_score +
    0.2 * r.regulatory_score
  );
}

const AXIS_META: { key: keyof Output["replicability"]["confidence"]; label: string; scoreKey: keyof Pick<Output["replicability"], "data_score" | "network_score" | "distribution_score" | "regulatory_score"> }[] = [
  { key: "data", label: "Data", scoreKey: "data_score" },
  { key: "network", label: "Network", scoreKey: "network_score" },
  { key: "distribution", label: "Distribution", scoreKey: "distribution_score" },
  { key: "regulatory", label: "Regulatory", scoreKey: "regulatory_score" },
];

const Renderer: React.FC<RendererProps<Output>> = ({ data, citations, section }) => {
  const aggregate = aggregateScore(data.replicability);
  const moatTypePhrase = data.moat_types
    .filter((t) => t !== "none")
    .map((t) => MOAT_TYPE_LABELS[t] ?? t)
    .join(" + ");

  const axes: RadarAxis[] = AXIS_META.map((m) => ({
    axis: m.label,
    score: data.replicability[m.scoreKey] as number,
    confidence: data.replicability.confidence[m.key],
  }));

  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)}>
      {/* Lead summary with trailing citations */}
      <p className="lead mb-10">
        {data.moat_summary}
        <CitationsTrail citations={citations} />
      </p>

      {/* Hero band: shared eyebrow over score + radar — paired, not stacked */}
      <div className="mb-2">
        <span className="eyebrow">Replicability score</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 sm:gap-6 items-center mb-3">
        <ReplicabilityScore score={aggregate} moatTypePhrase={moatTypePhrase || undefined} />
        <ReplicabilityRadar axes={axes} height={220} />
      </div>
      <p
        className="micro"
        style={{
          color: "var(--text-quiet)",
          letterSpacing: "0.04em",
          fontStyle: "italic",
          marginBottom: 36,
        }}
      >
        Weighted average — data 30%, network 30%, distribution 20%, regulatory 20%.
      </p>

      {/* Per-axis breakdown — single-line rows, prose fills the right side */}
      <div className="mb-12">
        <h3 className="h-3 mb-4" style={{ color: "var(--text)" }}>By axis</h3>
        <div style={{ borderBottom: "1px solid var(--border-faint)" }}>
          {AXIS_META.map((m) => (
            <AxisRow
              key={m.key}
              label={m.label}
              score={data.replicability[m.scoreKey] as number}
              confidence={data.replicability.confidence[m.key]}
              reasoning={data.replicability.reasoning[m.key]}
            />
          ))}
        </div>
      </div>

      {/* Verdict triptych: + defensible / − overrated / → attack vector. */}
      <CalloutBlock variant="plain" eyebrow="Defensible" mark="+" body={data.defensible} />
      <CalloutBlock variant="plain" eyebrow="Overrated" mark="−" body={data.overrated} />
      <CalloutBlock variant="accent" eyebrow="Attack vector" mark="→" body={data.attack_vector} />

      {/* Compounding moments — vertical timeline with dot rail */}
      {data.compounding_moments.length > 0 && (
        <div className="mt-12">
          <h3 className="h-3 mb-5" style={{ color: "var(--text)" }}>Compounding moments</h3>
          <ol
            className="relative list-none p-0 m-0"
            style={{ paddingLeft: 28 }}
          >
            {/* The rail */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 5,
                top: 8,
                bottom: 8,
                width: 1,
                background: "var(--border-color)",
              }}
            />
            {data.compounding_moments
              .slice()
              .sort((a, b) => a.year - b.year)
              .map((m, i) => (
                <CompoundingMoment key={`${m.year}-${i}`} moment={m} />
              ))}
          </ol>
        </div>
      )}
    </SectionShell>
  );
};

interface AxisRowProps {
  label: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

function AxisRow({ label, score, confidence, reasoning }: AxisRowProps) {
  const scoreColor = colorForScore(score);
  return (
    <div
      className="grid grid-cols-[110px_56px_1fr] gap-4 items-baseline"
      style={{ padding: "14px 0", borderTop: "1px solid var(--border-faint)" }}
    >
      <span
        className="micro"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.13em",
          color: "var(--text-muted)",
          fontWeight: 500,
          fontSize: 11,
        }}
      >
        {label}
      </span>
      <span
        className="num tabular inline-flex items-baseline gap-1.5"
        style={{ justifyContent: "flex-end" }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            lineHeight: 1,
            color: scoreColor,
            fontWeight: 400,
          }}
        >
          {score}
        </span>
        <ConfidenceDot
          variant={moatConfidenceToVariant(confidence)}
          title={`${confidence} confidence`}
        />
      </span>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--text-muted)",
          margin: 0,
        }}
      >
        {reasoning}
      </p>
    </div>
  );
}

interface CalloutBlockProps {
  eyebrow: string;
  body: string;
  mark: string;
  variant: "plain" | "accent";
}

function VerdictMark({ mark }: { mark: string }) {
  return (
    <span
      aria-hidden
      className="font-mono"
      style={{
        display: "inline-block",
        width: 18,
        textAlign: "center",
        color: "var(--accent-color)",
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: 0,
        transform: "translateY(-1px)",
      }}
    >
      {mark}
    </span>
  );
}

function CalloutBlock({ eyebrow, body, mark, variant }: CalloutBlockProps) {
  if (variant === "accent") {
    return (
      <div
        className="mb-7 px-5 py-4 rounded-md"
        style={{
          background: "var(--callout-bg)",
          borderLeft: "3px solid var(--callout-border)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <VerdictMark mark={mark} />
          <h3 className="eyebrow" style={{ color: "var(--accent-color)" }}>
            {eyebrow}
          </h3>
        </div>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--text)",
            margin: 0,
            paddingLeft: 26,
          }}
        >
          {body}
        </p>
      </div>
    );
  }

  return (
    <div
      className="mb-9 last:mb-0"
      style={{ paddingTop: 18, borderTop: "1px solid var(--border-faint)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <VerdictMark mark={mark} />
        <h3 className="eyebrow">{eyebrow}</h3>
      </div>
      <p className="body" style={{ paddingLeft: 26, margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

interface CompoundingMomentProps {
  moment: Output["compounding_moments"][number];
}

function CompoundingMoment({ moment }: CompoundingMomentProps) {
  const isInferred = moment.inferred === true;

  // Dot anchored on rail. Inferred = hollow + dashed; otherwise = filled accent.
  const dotStyle: React.CSSProperties = isInferred
    ? {
        background: "var(--bg)",
        border: "1.5px dashed var(--accent-color)",
      }
    : {
        background: "var(--accent-color)",
        border: "1.5px solid var(--accent-color)",
      };

  return (
    <li className="relative" style={{ marginBottom: 32 }}>
      {/* Dot on rail. ol pl=28; rail at left=5 width=1 (center 5.5); dot 11px → li-coord -28 + 5.5 - 5.5 = -28. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -28,
          top: 8,
          width: 11,
          height: 11,
          borderRadius: 999,
          ...dotStyle,
        }}
      />
      {isInferred && (
        <span
          className="micro"
          style={{
            display: "block",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--text-faint)",
            fontWeight: 500,
            fontSize: 10,
          }}
        >
          Inferred
        </span>
      )}
      <div className="flex items-baseline gap-3 mb-1.5">
        <span
          className="num tabular"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 24,
            lineHeight: 1,
            color: "var(--text)",
            fontWeight: 400,
            minWidth: 56,
          }}
        >
          {moment.citation_url ? (
            <a
              href={moment.citation_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--text)",
                textDecoration: "none",
                borderBottom: "1px dotted var(--accent-color)",
                paddingBottom: 1,
              }}
            >
              {moment.year}
            </a>
          ) : (
            moment.year
          )}
        </span>
        <span
          style={{
            fontSize: 15,
            lineHeight: 1.45,
            color: "var(--text)",
            fontWeight: 500,
          }}
        >
          {moment.what_happened}
        </span>
      </div>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--text-muted)",
          margin: 0,
          paddingLeft: 68, // align under what_happened (year minWidth 56 + gap 12)
        }}
      >
        {moment.why_it_compounded}
      </p>
    </li>
  );
}

const SkeletonRenderer: React.FC = () => (
  <div className="space-y-3">
    <Skeleton className="h-5 w-3/4" />
    <Skeleton className="h-5 w-2/3" />
    <Skeleton className="h-40 w-full mt-6" />
    <Skeleton className="h-4 w-5/6 mt-4" />
    <Skeleton className="h-4 w-4/6" />
    <Skeleton className="h-4 w-3/4" />
  </div>
);

export const moat: SectionDefinition<Output> = {
  key: "moat",
  cacheKey: "founderscope:section:moat",
  title: "Moat & Replicability",
  order: 2,
  cacheTtlDays: 30,
  schemaVersion: 2,
  tier: "reasoning",
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
        confidence: "high",
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
