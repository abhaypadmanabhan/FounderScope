// Section 4 — Tech Stack & Build Cost: current + MVP stack grids, cost breakdown.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { buildSectionPrompt, claimsSchema, type Claim } from "./shared";
import { SectionShell } from "@/components/section-shell";
import { CitationsTrail } from "@/components/citation-sup";
import { formatUsdCompact, padOrder } from "@/lib/sections/format";

const stackShape = z.object({
  frontend: z.array(z.string()),
  backend: z.array(z.string()),
  database: z.array(z.string()),
  infra: z.array(z.string()),
  vendors: z.array(z.string()),
});

const outputSchema = z.object({
  current_stack: stackShape,
  mvp_stack: stackShape,
  mvp_cost_estimate: z.object({
    team_low_usd: z.number(),
    team_high_usd: z.number(),
    infra_low_usd: z.number(),
    infra_high_usd: z.number(),
    other_low_usd: z.number(),
    other_high_usd: z.number(),
    total_low_usd: z.number(),
    total_high_usd: z.number(),
    methodology: z.string(),
  }),
  stack_evolution: z.string(),
  // Section-level confidence. Optional so legacy fixtures still validate.
  confidence: z.enum(["high", "medium", "low"]).optional(),
  claims: claimsSchema,
});
type Output = z.infer<typeof outputSchema>;
type Stack = z.infer<typeof stackShape>;

const BUCKETS: { key: keyof Stack; label: string }[] = [
  { key: "frontend", label: "Frontend" },
  { key: "backend", label: "Backend" },
  { key: "database", label: "Database" },
  { key: "infra", label: "Infra" },
  { key: "vendors", label: "Vendors" },
];

function stackIsEmpty(s: Stack): boolean {
  return BUCKETS.every((b) => s[b.key].length === 0);
}

function StackList({ stack, compact = false }: { stack: Stack; compact?: boolean }) {
  if (stackIsEmpty(stack)) {
    return (
      <p
        className="body-muted"
        style={{ fontStyle: "italic", margin: 0 }}
      >
        Stack not publicly findable.
      </p>
    );
  }
  const filled = BUCKETS.filter((b) => stack[b.key].length > 0);
  const labelCol = compact ? 86 : 96;
  const techSize = compact ? 14 : 15;
  const techColor = compact ? "var(--text-muted)" : "var(--text)";
  const rowPad = compact ? "5px 0" : "7px 0";
  return (
    <dl
      className="m-0 grid sm:grid-cols-2 gap-x-10"
      style={{ rowGap: 0 }}
    >
      {filled.map((b) => {
        const techs = stack[b.key];
        return (
          <div
            key={b.key}
            className="grid items-baseline"
            style={{
              gridTemplateColumns: `${labelCol}px 1fr`,
              gap: 14,
              padding: rowPad,
            }}
          >
            <dt
              className="micro"
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.13em",
                color: "var(--text-muted)",
                fontWeight: 500,
                fontSize: compact ? 10 : 11,
              }}
            >
              {b.label}
            </dt>
            <dd
              className="m-0"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: techSize,
                lineHeight: 1.5,
                color: techColor,
              }}
            >
              {techs.map((t, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span
                      style={{
                        color: "var(--text-quiet)",
                        margin: "0 0.5em",
                      }}
                    >
                      ·
                    </span>
                  )}
                  {t}
                </React.Fragment>
              ))}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

interface CostRowProps {
  label: string;
  low: number;
  high: number;
  emphatic?: boolean;
}

function CostRow({ label, low, high, emphatic }: CostRowProps) {
  return (
    <div
      className="grid grid-cols-[110px_1fr] gap-4 items-baseline"
      style={{
        padding: emphatic ? "11px 0 10px" : "7px 0",
        borderTop: emphatic
          ? "1px solid var(--border-color)"
          : "1px solid var(--border-faint)",
      }}
    >
      <span
        className="micro"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.13em",
          color: emphatic ? "var(--text)" : "var(--text-muted)",
          fontWeight: emphatic ? 600 : 500,
          fontSize: 11,
        }}
      >
        {label}
      </span>
      <span
        className="num tabular"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: emphatic ? 21 : 16,
          lineHeight: 1.1,
          color: "var(--text)",
          fontWeight: 400,
          letterSpacing: "-0.01em",
        }}
      >
        {formatUsdCompact(low)}
        <span
          style={{
            color: "var(--text-quiet)",
            margin: "0 0.4em",
            fontFamily: "var(--font-sans)",
            fontWeight: 300,
          }}
        >
          –
        </span>
        {formatUsdCompact(high)}
      </span>
    </div>
  );
}

function inferredClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.inferred);
}

const Renderer: React.FC<RendererProps<Output>> = ({ data, citations, section }) => {
  const inferred = inferredClaims(data.claims);
  const cost = data.mvp_cost_estimate;
  const showMvpStack = !stackIsEmpty(data.mvp_stack);

  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)} width="wide">
      <div className="mb-6">
        <h3 className="h-3 mb-3" style={{ color: "var(--text)" }}>Current stack</h3>
        <StackList stack={data.current_stack} />
      </div>

      {data.stack_evolution && (
        <p
          className="body mb-7"
          style={{ color: "var(--text)", maxWidth: 680 }}
        >
          {data.stack_evolution}
          <CitationsTrail citations={citations} />
        </p>
      )}

      {showMvpStack && (
        <div className="mb-7">
          <h3
            className="h-3 mb-2.5"
            style={{ color: "var(--text-muted)", fontSize: 17, fontWeight: 500 }}
          >
            MVP stack{" "}
            <span
              style={{
                color: "var(--text-faint)",
                fontWeight: 400,
                fontStyle: "italic",
              }}
            >
              — where they started
            </span>
          </h3>
          <StackList stack={data.mvp_stack} compact />
        </div>
      )}

      <div className="grid gap-x-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <div>
          <h3 className="h-3 mb-3" style={{ color: "var(--text)" }}>Estimated rebuild cost</h3>
          <div>
            <CostRow label="Team" low={cost.team_low_usd} high={cost.team_high_usd} />
            <CostRow label="Infra" low={cost.infra_low_usd} high={cost.infra_high_usd} />
            <CostRow label="Other" low={cost.other_low_usd} high={cost.other_high_usd} />
            <CostRow
              label="Total"
              low={cost.total_low_usd}
              high={cost.total_high_usd}
              emphatic
            />
          </div>
        </div>
        <div>
          <h3 className="eyebrow mb-2.5" style={{ color: "var(--text-faint)" }}>
            Methodology
          </h3>
          <p
            className="small"
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {cost.methodology}
          </p>
        </div>
      </div>

      {inferred.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--border-faint)",
            paddingTop: 14,
            marginTop: 22,
          }}
        >
          <h3 className="eyebrow mb-2" style={{ color: "var(--text-faint)" }}>
            Inferred — no direct citation
          </h3>
          <ul className="m-0 p-0 list-none">
            {inferred.map((c) => (
              <li
                key={c.id}
                className="micro"
                style={{
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  letterSpacing: "0.01em",
                  lineHeight: 1.55,
                  paddingLeft: 14,
                  position: "relative",
                  marginBottom: 4,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 6,
                    width: 8,
                    height: 1,
                    background: "var(--border-strong)",
                  }}
                />
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionShell>
  );
};

const SkeletonRenderer: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-4 w-1/2 mt-6" />
    <Skeleton className="h-4 w-2/3" />
  </div>
);

export const techStack: SectionDefinition<Output> = {
  key: "tech_stack",
  cacheKey: "founderscope:section:tech_stack",
  title: "Tech Stack & Build Cost",
  order: 4,
  cacheTtlDays: 14,
  schemaVersion: 2,
  tier: "default",
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "Tech Stack & Build Cost",
      sectionInstructions: `Research the tech stack of ${c.name} now and at MVP. Sources: job postings (currently and historically via Wayback), engineering blog, GitHub orgs, BuiltWith, StackShare, conference talks, founder interviews.

For stealth-mode or unknown stacks, return empty arrays for current_stack/mvp_stack and explain in stack_evolution why nothing was findable (e.g. "stealth, no public job postings, no GitHub org, no engineering blog yet"). Do NOT invent stacks based on category cliché — if you're guessing the stack from category convention rather than direct signal, mark inferred: true on the relevant claims and say so plainly in stack_evolution.

For MVP cost: estimate team (founders + early hires × months × market salary for their geography), infra (first 6 months), other (legal, design, tools). Express each as a low-high range. The cost estimate is always your synthesis — flag the methodology assumptions explicitly.

methodology: 1-2 sentences stating your assumptions.
stack_evolution: 2-3 sentence narrative on what changed and why; for early-stage companies this may be "no evolution yet, current stack = MVP stack".

Cite every concrete fact (specific tool name attribution, salary band source, etc.) with a real URL in claims where possible. Stack guesses without direct signal: citation_url/quote: null, inferred: true.`,
      schema: outputSchema,
      example: {
        current_stack: {
          frontend: ["Next.js", "React", "TypeScript", "Tailwind"],
          backend: ["Node.js", "Go", "Rust"],
          database: ["PostgreSQL", "Redis"],
          infra: ["AWS", "Cloudflare", "Vercel edge network"],
          vendors: ["Datadog", "Stripe", "Auth0", "PlanetScale"],
        },
        mvp_stack: {
          frontend: ["Next.js", "React", "Tailwind"],
          backend: ["Node.js"],
          database: ["PostgreSQL (Supabase)"],
          infra: ["Vercel", "Cloudflare"],
          vendors: ["Stripe"],
        },
        mvp_cost_estimate: {
          team_low_usd: 240000,
          team_high_usd: 480000,
          infra_low_usd: 1500,
          infra_high_usd: 6000,
          other_low_usd: 8000,
          other_high_usd: 25000,
          total_low_usd: 249500,
          total_high_usd: 511000,
          methodology:
            "2-3 founders × 6 months × SF/NYC senior salary band ($200-320k all-in). Infra is Vercel + Supabase Pro + Cloudflare. Other is legal incorporation, design tools, observability free tiers.",
        },
        stack_evolution:
          "Vercel started on Now.sh (their own product) with a Node monolith, then split deployment infra into the edge platform and added Go and Rust for performance-critical paths as the build pipeline scaled. The customer-facing product stayed Next.js — they ship their own framework.",
        confidence: "medium",
        claims: [
          {
            id: 1,
            text: "Vercel's public open-source repos use TypeScript, Go, and Rust.",
            citation_url: "https://github.com/vercel",
            citation_quote: "Languages: TypeScript, Go, Rust, JavaScript.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
