// Section 7 — Market & Competition: TAM/SAM/SOM rings, competitors, pioneer verdict.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";
import { SectionShell } from "@/components/section-shell";
import { CitationsTrail } from "@/components/citation-sup";
import { ConfidenceDot, type ConfidenceVariant } from "@/components/confidence-dot";
import { formatUsdCompact, padOrder } from "@/lib/sections/format";

const sizeConfidenceEnum = z.enum([
  "analyst",
  "company_stated",
  "our_estimate",
  "unknown",
]);

const outputSchema = z.object({
  tam_usd: z.number().nullable(),
  sam_usd: z.number().nullable(),
  som_usd: z.number().nullable(),
  market_size_source: z.string(),
  market_size_confidence: sizeConfidenceEnum,
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

function sizeConfidenceToVariant(
  c: Output["market_size_confidence"]
): ConfidenceVariant | null {
  if (c === "analyst") return "full";
  if (c === "company_stated") return "partial";
  if (c === "our_estimate") return "partial";
  return null;
}

function sizeConfidenceCaveat(c: Output["market_size_confidence"]): string | null {
  if (c === "company_stated") return "per company";
  if (c === "our_estimate") return "estimated";
  return null;
}

const POSITION_LABEL: Record<Output["pioneer_or_follower"], string> = {
  pioneer: "pioneer",
  fast_follower: "fast follower",
  follower: "follower",
  unclear: "unclear",
};

interface SizeCellProps {
  label: string;
  value: number;
  caveat: string | null;
}

function SizeCell({ label, value, caveat }: SizeCellProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="micro"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.13em",
          color: "var(--text-faint)",
          fontWeight: 500,
          fontSize: 11,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        className="num tabular"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 30,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: "var(--text)",
          fontWeight: 400,
        }}
      >
        {formatUsdCompact(value)}
      </div>
      {caveat && (
        <div
          className="micro"
          style={{
            color: "var(--text-faint)",
            fontStyle: "italic",
            letterSpacing: "0.02em",
            marginTop: 4,
          }}
        >
          {caveat}
        </div>
      )}
    </div>
  );
}

function MarketSizeBand({
  data,
}: {
  data: Pick<
    Output,
    | "tam_usd"
    | "sam_usd"
    | "som_usd"
    | "market_size_source"
    | "market_size_confidence"
    | "category_growth_rate"
  >;
}) {
  const caveat = sizeConfidenceCaveat(data.market_size_confidence);
  const variant = sizeConfidenceToVariant(data.market_size_confidence);
  const cells: { label: string; value: number; caveat: string | null }[] = [];
  if (data.tam_usd != null) cells.push({ label: "TAM", value: data.tam_usd, caveat });
  if (data.sam_usd != null) cells.push({ label: "SAM", value: data.sam_usd, caveat });
  if (data.som_usd != null) cells.push({ label: "SOM", value: data.som_usd, caveat });

  const hasGrowth = data.category_growth_rate && data.category_growth_rate !== "unknown";

  if (cells.length === 0 && !hasGrowth) {
    if (data.market_size_confidence === "unknown") {
      return (
        <div className="mb-9">
          <div className="eyebrow mb-2">Market size</div>
          <p className="lead" style={{ margin: 0, fontStyle: "italic", color: "var(--text-faint)" }}>
            No defensible market sizing.
          </p>
        </div>
      );
    }
    return null;
  }

  const totalCells = cells.length + (hasGrowth ? 1 : 0);
  return (
    <div className="mb-9">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="eyebrow">Market size</span>
        {variant && (
          <ConfidenceDot
            variant={variant}
            title={`${data.market_size_confidence.replace("_", " ")} confidence`}
          />
        )}
      </div>
      <div
        className="flex flex-wrap items-end"
        style={{
          gap: 0,
          borderTop: "1px solid var(--border-faint)",
          borderBottom: "1px solid var(--border-faint)",
          padding: "16px 0",
        }}
      >
        {cells.map((c, i) => (
          <div
            key={c.label}
            className="flex-1"
            style={{
              minWidth: 130,
              padding: "0 18px",
              borderLeft:
                i === 0 ? "none" : "1px solid var(--border-faint)",
            }}
          >
            <SizeCell label={c.label} value={c.value} caveat={c.caveat} />
          </div>
        ))}
        {hasGrowth && (
          <div
            className="flex-1"
            style={{
              minWidth: 130,
              padding: "0 18px",
              borderLeft: totalCells > 1 ? "1px solid var(--border-faint)" : "none",
            }}
          >
            <div
              className="micro"
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.13em",
                color: "var(--text-faint)",
                fontWeight: 500,
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Growth
            </div>
            <div
              className="num tabular"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 24,
                lineHeight: 1.1,
                letterSpacing: "-0.015em",
                color: "var(--text)",
                fontWeight: 400,
              }}
            >
              {data.category_growth_rate}
            </div>
          </div>
        )}
      </div>
      {cells.length > 0 && data.market_size_source && (
        <div
          className="micro"
          style={{
            color: "var(--text-faint)",
            letterSpacing: "0.02em",
            marginTop: 8,
            fontStyle: "italic",
          }}
        >
          source: {data.market_size_source}
        </div>
      )}
    </div>
  );
}

function PositionBlock({
  position,
  reasoning,
  citations,
}: {
  position: Output["pioneer_or_follower"];
  reasoning: string;
  citations: import("./types").Citation[];
}) {
  return (
    <div className="mb-10" style={{ maxWidth: 680 }}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="eyebrow">Position</span>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            color: "var(--accent-color)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          {POSITION_LABEL[position]}
        </span>
      </div>
      <p
        className="body"
        style={{
          color: "var(--text)",
          margin: 0,
        }}
      >
        {reasoning}
        <CitationsTrail citations={citations} />
      </p>
    </div>
  );
}

function CompetitorRow({ c }: { c: Output["competitors"][number] }) {
  return (
    <li
      style={{
        padding: "12px 0",
        borderTop: "1px solid var(--border-faint)",
      }}
    >
      <div
        className="flex items-baseline justify-between gap-4 flex-wrap"
        style={{ marginBottom: 3 }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            color: "var(--text)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          {c.name}
        </span>
        {c.domain && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-faint)",
              letterSpacing: "0.01em",
            }}
          >
            {c.domain}
          </span>
        )}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--text-muted)",
          fontStyle: "italic",
        }}
      >
        {c.positioning}
      </p>
    </li>
  );
}

function CompetitorsList({
  competitors,
}: {
  competitors: Output["competitors"];
}) {
  if (competitors.length === 0) return null;
  return (
    <div>
      <h3 className="h-3 mb-3" style={{ color: "var(--text)" }}>Competitors</h3>
      <ul
        className="m-0 p-0 list-none"
        style={{ borderBottom: "1px solid var(--border-faint)" }}
      >
        {competitors.map((c, i) => (
          <CompetitorRow key={`${c.name}-${i}`} c={c} />
        ))}
      </ul>
    </div>
  );
}

const Renderer: React.FC<RendererProps<Output>> = ({ data, citations, section }) => {
  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)} width="wide">
      <MarketSizeBand data={data} />
      <PositionBlock
        position={data.pioneer_or_follower}
        reasoning={data.pioneer_reasoning}
        citations={citations}
      />
      <CompetitorsList competitors={data.competitors} />
    </SectionShell>
  );
};

const SkeletonRenderer: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="h-3 w-1/4" />
    <div className="flex gap-6 mt-2">
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
    </div>
    <Skeleton className="h-4 w-3/4 mt-6" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-4 w-2/3" />
  </div>
);

export const market: SectionDefinition<Output> = {
  key: "market",
  title: "Market & Competition",
  order: 7,
  cacheTtlDays: 14,
  schemaVersion: 2,
  tier: "default",
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
