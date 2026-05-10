// Section 5 — Funding Journey: round timeline, investors, milestones.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";
import { SectionShell } from "@/components/section-shell";
import { CitationsTrail } from "@/components/citation-sup";
import { formatUsdCompact, padOrder } from "@/lib/sections/format";

const milestoneKindEnum = z.enum([
  "product",
  "customer",
  "hire",
  "pivot",
  "press",
  "other",
]);

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
      kind: milestoneKindEnum,
    })
  ),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;
type Round = Output["rounds"][number];
type Milestone = Output["milestones"][number];

type Entry =
  | { kind: "round"; date: string; data: Round }
  | { kind: "milestone"; date: string; data: Milestone };

function buildEntries(data: Output): Entry[] {
  const out: Entry[] = [
    ...data.rounds.map((r): Entry => ({ kind: "round", date: r.date, data: r })),
    ...data.milestones.map((m): Entry => ({ kind: "milestone", date: m.date, data: m })),
  ];
  // String compare works for ISO-prefixed dates (YYYY, YYYY-MM, YYYY-MM-DD).
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function followInvestors(all: string[], leads: string[]): string[] {
  const leadSet = new Set(leads);
  return all.filter((i) => !leadSet.has(i));
}

function RailDot({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: -24,
        top: filled ? 6 : 8,
        width: filled ? 11 : 9,
        height: filled ? 11 : 9,
        borderRadius: 999,
        background: filled ? "var(--accent-color)" : "var(--bg)",
        border: filled
          ? "1.5px solid var(--accent-color)"
          : "1.5px dashed var(--accent-color)",
      }}
    />
  );
}

function DateColumn({ date }: { date: string }) {
  // YYYY → just year. YYYY-MM → year + month inline (compact).
  const m = date.match(/^(\d{4})(?:-(\d{2}))?/);
  const year = m?.[1] ?? date;
  const monthIdx = m?.[2] ? parseInt(m[2], 10) - 1 : null;
  const monthShort =
    monthIdx != null && monthIdx >= 0 && monthIdx < 12
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIdx]
      : null;
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="num tabular"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          lineHeight: 1,
          color: "var(--text)",
          fontWeight: 400,
        }}
      >
        {year}
      </span>
      {monthShort && (
        <span
          className="micro"
          style={{
            color: "var(--text-faint)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontSize: 9,
          }}
        >
          {monthShort}
        </span>
      )}
    </div>
  );
}

// Shared 3-col timeline grid: date (auto) | content (flex) | right (fixed amount).
// Both rounds and milestones use the same template so the rail and column
// edges align. Milestones leave the right column empty.
const TIMELINE_GRID = "minmax(95px, auto) minmax(0, 1fr) 130px";

function RoundEntry({ round }: { round: Round }) {
  const followers = followInvestors(round.all_investors, round.lead_investors);
  const amountText =
    round.amount_usd == null ? null : formatUsdCompact(round.amount_usd);
  return (
    <li className="relative" style={{ marginBottom: 16 }}>
      <RailDot filled />
      <div
        className="grid items-baseline"
        style={{
          gridTemplateColumns: TIMELINE_GRID,
          columnGap: 20,
        }}
      >
        <DateColumn date={round.date} />
        <div style={{ minWidth: 0 }}>
          <div
            className="micro"
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.13em",
              color: "var(--text)",
              fontWeight: 600,
              fontSize: 11,
              marginBottom: 3,
            }}
          >
            {round.round_type}
          </div>
          {round.lead_investors.length > 0 && (
            <div
              style={{
                fontSize: 14,
                color: "var(--text)",
                lineHeight: 1.45,
              }}
            >
              {round.lead_investors.join(", ")}
              {followers.length > 0 && (
                <span
                  className="small"
                  style={{
                    color: "var(--text-muted)",
                    marginLeft: 6,
                  }}
                >
                  <span style={{ color: "var(--text-faint)" }}>+ </span>
                  {followers.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right" style={{ minWidth: 0 }}>
          <div
            className="num tabular"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 19,
              color: "var(--text)",
              fontWeight: 400,
              lineHeight: 1.1,
            }}
          >
            {amountText ?? (
              <span
                style={{
                  fontStyle: "italic",
                  fontSize: 14,
                  color: "var(--text-faint)",
                }}
              >
                undisclosed
              </span>
            )}
          </div>
          {round.valuation_usd != null && (
            <div
              className="micro"
              style={{
                color: "var(--text-faint)",
                marginTop: 3,
                fontStyle: "italic",
                letterSpacing: "0.02em",
              }}
            >
              @ {formatUsdCompact(round.valuation_usd)} val
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function MilestoneEntry({ milestone }: { milestone: Milestone }) {
  return (
    <li className="relative" style={{ marginBottom: 12 }}>
      <RailDot filled={false} />
      <div
        className="grid items-baseline"
        style={{
          gridTemplateColumns: TIMELINE_GRID,
          columnGap: 20,
        }}
      >
        <DateColumn date={milestone.date} />
        <div className="flex items-baseline gap-2.5 flex-wrap" style={{ minWidth: 0 }}>
          <span
            className="micro"
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.13em",
              color: "var(--text-faint)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 10,
            }}
          >
            {milestone.kind}
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {milestone.label}
          </span>
        </div>
        <div />
      </div>
    </li>
  );
}

const Renderer: React.FC<RendererProps<Output>> = ({ data, citations, section }) => {
  const entries = buildEntries(data);
  const totalText =
    data.total_raised_usd != null ? formatUsdCompact(data.total_raised_usd) : null;
  const onlyMilestones = data.rounds.length === 0;

  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)} width="wide">
      <div className="mb-7" style={{ maxWidth: 680 }}>
        {totalText ? (
          <>
            <div className="eyebrow mb-2">Total raised</div>
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
              {totalText}
              <CitationsTrail citations={citations} />
            </div>
          </>
        ) : onlyMilestones ? (
          <>
            <div className="eyebrow mb-2">Funding posture</div>
            <p
              className="lead"
              style={{ margin: 0, fontStyle: "italic", color: "var(--text-muted)" }}
            >
              No disclosed external funding.
              <CitationsTrail citations={citations} />
            </p>
          </>
        ) : (
          <>
            <div className="eyebrow mb-2">Total raised</div>
            <p
              className="lead"
              style={{ margin: 0, fontStyle: "italic", color: "var(--text-faint)" }}
            >
              undisclosed
              <CitationsTrail citations={citations} />
            </p>
          </>
        )}
      </div>

      {entries.length > 0 ? (
        <div>
          <h3 className="h-3 mb-5" style={{ color: "var(--text)" }}>Timeline</h3>
          <ol className="relative list-none p-0 m-0" style={{ paddingLeft: 24 }}>
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
            {entries.map((e, i) =>
              e.kind === "round" ? (
                <RoundEntry key={`r-${i}`} round={e.data} />
              ) : (
                <MilestoneEntry key={`m-${i}`} milestone={e.data} />
              )
            )}
          </ol>
        </div>
      ) : (
        <p className="body-muted" style={{ fontStyle: "italic" }}>
          No funding events on record.
        </p>
      )}
    </SectionShell>
  );
};

const SkeletonRenderer: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="h-8 w-1/3 mb-6" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-4 w-2/3" />
  </div>
);

export const funding: SectionDefinition<Output> = {
  key: "funding",
  title: "Funding Journey",
  order: 5,
  cacheTtlDays: 14,
  schemaVersion: 2,
  tier: "default",
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
