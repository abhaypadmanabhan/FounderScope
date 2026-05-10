// Section 6 — Traction: ARR, headcount, web traffic with data-quality badges.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";
import { SectionShell } from "@/components/section-shell";
import { ConfidenceDot, type ConfidenceVariant } from "@/components/confidence-dot";
import { HeadcountSparkline } from "@/components/headcount-sparkline";
import { formatUsdCompact, formatYearMonth, padOrder } from "@/lib/sections/format";

const arrConfidence = z.enum(["confirmed", "estimated", "unknown"]);
const headcountConfidence = z.enum(["confirmed", "estimated"]);

const outputSchema = z.object({
  arr_estimate: z.object({
    low_usd: z.number().nullable(),
    high_usd: z.number().nullable(),
    as_of: z.string().nullable(),
    confidence: arrConfidence,
    source: z.string().nullable(),
  }),
  headcount_history: z.array(
    z.object({
      date: z.string(),
      count: z.number().int(),
      confidence: headcountConfidence,
    })
  ),
  web_traffic_trend: z.enum(["up", "flat", "down", "unknown"]),
  web_traffic_note: z.string(),
  other_signals: z.array(z.string()),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;

function arrConfidenceToVariant(
  c: "confirmed" | "estimated" | "unknown"
): ConfidenceVariant {
  return c === "confirmed" ? "full" : c === "estimated" ? "partial" : "empty";
}

function headcountConfidenceToVariant(
  c: "confirmed" | "estimated"
): ConfidenceVariant {
  return c === "confirmed" ? "full" : "partial";
}

const TREND_GLYPH: Record<Output["web_traffic_trend"], string | null> = {
  up: "↑",
  flat: "→",
  down: "↓",
  unknown: null,
};

function ARRBlock({ arr }: { arr: Output["arr_estimate"] }) {
  const hasNumber = arr.low_usd != null || arr.high_usd != null;
  const showRange = arr.low_usd != null && arr.high_usd != null && arr.low_usd !== arr.high_usd;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="eyebrow">Annual recurring revenue</span>
        <ConfidenceDot
          variant={arrConfidenceToVariant(arr.confidence)}
          title={`${arr.confidence} confidence`}
        />
      </div>
      {hasNumber ? (
        <div
          className="num tabular"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 44,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            fontWeight: 400,
          }}
        >
          {showRange ? (
            <>
              {formatUsdCompact(arr.low_usd as number)}
              <span
                style={{
                  color: "var(--text-quiet)",
                  margin: "0 0.32em",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 300,
                  fontSize: 28,
                }}
              >
                –
              </span>
              {formatUsdCompact(arr.high_usd as number)}
            </>
          ) : (
            formatUsdCompact((arr.low_usd ?? arr.high_usd) as number)
          )}
        </div>
      ) : (
        <p
          className="lead"
          style={{
            margin: 0,
            fontStyle: "italic",
            color: "var(--text-faint)",
          }}
        >
          Not publicly disclosed.
        </p>
      )}
      {(arr.as_of || arr.source) && (
        <div
          className="micro"
          style={{
            color: "var(--text-faint)",
            letterSpacing: "0.02em",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {arr.as_of && <>as of {formatYearMonth(arr.as_of)}</>}
          {arr.as_of && arr.source && (
            <span style={{ color: "var(--text-quiet)" }}> · </span>
          )}
          {arr.source && <span style={{ fontStyle: "italic" }}>{arr.source}</span>}
        </div>
      )}
    </div>
  );
}

function HeadcountBlock({
  history,
  sparklineHeight = 96,
}: {
  history: Output["headcount_history"];
  sparklineHeight?: number;
}) {
  if (history.length === 0) return null;

  const latest = history[history.length - 1];

  if (history.length >= 3) {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="eyebrow">Headcount</span>
          <span
            className="num tabular flex items-baseline gap-1.5"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 24,
              color: "var(--text)",
              fontWeight: 400,
            }}
          >
            {latest.count.toLocaleString()}
            <ConfidenceDot
              variant={headcountConfidenceToVariant(latest.confidence)}
              title={`${latest.confidence}`}
            />
          </span>
        </div>
        <HeadcountSparkline
          data={history.map((h) => ({ date: h.date, count: h.count }))}
          height={sparklineHeight}
        />
        <div
          className="micro"
          style={{
            color: "var(--text-faint)",
            letterSpacing: "0.02em",
            marginTop: 4,
          }}
        >
          {formatYearMonth(history[0].date)} → {formatYearMonth(latest.date)}
        </div>
      </div>
    );
  }

  // 1-2 entries: text rows.
  return (
    <div>
      <h3 className="h-3 mb-3" style={{ color: "var(--text)" }}>Headcount</h3>
      <div style={{ borderTop: "1px solid var(--border-faint)" }}>
        {history.map((h, i) => (
          <div
            key={i}
            className="grid grid-cols-[110px_1fr_auto] gap-4 items-baseline"
            style={{
              padding: "8px 0",
              borderBottom: "1px solid var(--border-faint)",
            }}
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
              {formatYearMonth(h.date)}
            </span>
            <span
              className="num tabular"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 18,
                color: "var(--text)",
              }}
            >
              {h.count.toLocaleString()}
            </span>
            <ConfidenceDot
              variant={headcountConfidenceToVariant(h.confidence)}
              title={h.confidence}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TrafficRow({
  trend,
  note,
}: {
  trend: Output["web_traffic_trend"];
  note: string;
}) {
  const glyph = TREND_GLYPH[trend];
  if (trend === "unknown") return null;
  return (
    <div className="mb-7">
      <div
        className="grid items-baseline"
        style={{
          gridTemplateColumns: "110px auto minmax(0, 1fr)",
          columnGap: 16,
        }}
      >
        <span className="eyebrow">Web traffic</span>
        <span
          aria-hidden
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            lineHeight: 1,
            color: "var(--accent-color)",
            fontWeight: 400,
          }}
        >
          {glyph}
        </span>
        {note && (
          <span
            style={{
              fontSize: 14,
              color: "var(--text-muted)",
              lineHeight: 1.55,
            }}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

function SignalsList({ signals }: { signals: string[] }) {
  if (signals.length === 0) return null;
  return (
    <div>
      <h3 className="h-3 mb-3" style={{ color: "var(--text)" }}>Other signals</h3>
      <ul
        className="m-0 p-0 list-none"
        style={{ borderTop: "1px solid var(--border-faint)" }}
      >
        {signals.map((s, i) => (
          <li
            key={i}
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--text)",
              padding: "8px 0",
              borderBottom: "1px solid var(--border-faint)",
            }}
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

const Renderer: React.FC<RendererProps<Output>> = ({ data, section }) => {
  const showSideBySide = data.headcount_history.length > 0;
  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)} width="wide">
      <div
        className={
          showSideBySide
            ? "grid gap-x-12 gap-y-8 mb-9 items-start grid-cols-1 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            : "mb-9"
        }
      >
        <ARRBlock arr={data.arr_estimate} />
        {data.headcount_history.length > 0 && (
          <HeadcountBlock history={data.headcount_history} />
        )}
      </div>
      <TrafficRow trend={data.web_traffic_trend} note={data.web_traffic_note} />
      <SignalsList signals={data.other_signals} />
    </SectionShell>
  );
};

const SkeletonRenderer: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="h-3 w-1/4" />
    <Skeleton className="h-8 w-1/2" />
    <Skeleton className="h-20 w-full mt-4" />
    <Skeleton className="h-4 w-2/3 mt-3" />
    <Skeleton className="h-4 w-5/6" />
  </div>
);

export const traction: SectionDefinition<Output> = {
  key: "traction",
  title: "Traction",
  order: 6,
  cacheTtlDays: 7,
  schemaVersion: 2,
  tier: "default",
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
