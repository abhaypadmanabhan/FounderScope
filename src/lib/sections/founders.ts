// Section 3 — Founders: per-founder cards with bio sheet.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";

const outputSchema = z.object({
  founders: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        photo_url: z.string().url().nullable(),
        linkedin_url: z.string().url().nullable(),
        twitter_url: z.string().url().nullable(),
        personal_site: z.string().url().nullable(),
        college: z.string().nullable(),
        prior_companies: z.array(z.string()),
        technical: z.boolean(),
        what_they_bring: z.string(),
        full_bio: z.string(),
      })
    )
    .min(1)
    .max(6),
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

export const founders: SectionDefinition<Output> = {
  key: "founders",
  title: "Founders",
  order: 3,
  cacheTtlDays: 30,
  schemaVersion: 2,
  model: DEFAULT_MODEL,
  webSearchVersion: DEFAULT_WEB_SEARCH,
  buildPrompt: (c) =>
    buildSectionPrompt({
      company: c,
      sectionTitle: "Founders",
      sectionInstructions: `Identify the founders of ${c.name} (1 to 6 people).

FAIL-LOUD POLICY: If you cannot identify any founders from any public source — Crunchbase, LinkedIn, the company's own site, press coverage, founder Twitter — return founders: [] anyway. The schema requires at least 1, so an empty array will be rejected by the validator and the orchestrator will surface the failure to the user with the correct reason ("no founders identifiable"). This is the correct path. Do NOT invent founders to satisfy the min(1) constraint. An empty founders[] means the user got the wrong company or the company is too stealth to research at all — both findings worth surfacing.

NEVER INVENT prior companies, education, or roles. If a detail can't be verified from a public source, set the corresponding nullable field to null (linkedin_url, twitter_url, personal_site, photo_url, college are all nullable). For prior_companies, omit unverifiable entries from the array — do not list a company you only suspect they worked at.

For each founder:
- technical: true if they write code or have CS/ML/EE background, else false.
- what_they_bring: one line (e.g. 'distribution from prior YC network').
- full_bio: 2-4 sentences. Stick to verifiable facts; do not pad with speculation.
- photo_url: ONLY if you find one on a public source you can cite — Wikipedia, company About page, public conference talks. Never invent. Use null otherwise.
- linkedin_url, twitter_url, personal_site: include if publicly known, else null.
- claims: cite every concrete fact (college, prior company, role) with a real URL where possible. If a fact is observable but unsourced, citation_url/quote: null and inferred: true.`,
      schema: outputSchema,
      example: {
        founders: [
          {
            name: "Dario Amodei",
            role: "CEO",
            photo_url: null,
            linkedin_url: null,
            twitter_url: "https://twitter.com/DarioAmodei",
            personal_site: null,
            college: "Princeton (PhD)",
            prior_companies: ["OpenAI", "Google Brain", "Baidu"],
            technical: true,
            what_they_bring:
              "Deep RL + alignment research credibility from leading scaling at OpenAI.",
            full_bio:
              "Dario Amodei was VP of Research at OpenAI before co-founding Anthropic in 2021. PhD in computational neuroscience from Princeton. Co-author of the original GPT-3 paper and the Concrete Problems in AI Safety paper that helped frame the alignment field.",
          },
          {
            name: "Daniela Amodei",
            role: "President",
            photo_url: null,
            linkedin_url: "https://www.linkedin.com/in/daniela-amodei-790bb22a/",
            twitter_url: null,
            personal_site: null,
            college: "UC Santa Cruz",
            prior_companies: ["OpenAI", "Stripe"],
            technical: false,
            what_they_bring:
              "Operations and policy spine — ran ops at OpenAI through GPT-3 era, scaled Stripe Atlas earlier.",
            full_bio:
              "Daniela Amodei was VP of Operations at OpenAI before co-founding Anthropic. Before OpenAI she spent five years at Stripe across Risk and Atlas. Her background is in international development and policy.",
          },
        ],
        claims: [
          {
            id: 1,
            text: "Anthropic was founded in 2021 by former OpenAI researchers including Dario and Daniela Amodei.",
            citation_url: "https://www.anthropic.com/company",
            citation_quote:
              "Anthropic was founded in 2021 by Dario and Daniela Amodei, along with five colleagues from OpenAI.",
          },
        ],
      },
    }),
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
