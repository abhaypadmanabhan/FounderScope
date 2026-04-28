// Section 4 — Tech Stack & Build Cost: current + MVP stack grids, cost breakdown.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, Citation } from "./types";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";

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

export const techStack: SectionDefinition<Output> = {
  key: "tech_stack",
  title: "Tech Stack & Build Cost",
  order: 4,
  cacheTtlDays: 14,
  schemaVersion: 2,
  model: DEFAULT_MODEL,
  webSearchVersion: DEFAULT_WEB_SEARCH,
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
