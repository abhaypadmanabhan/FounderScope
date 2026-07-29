// Shared preamble, citation claim schema, prompt builder, and Citation extraction helper.
//
// POSTURE — read before tightening citation handling:
// Founderscope is a founder-intel tool. Users research everything from
// public giants to 6-month-old YC startups. For early-stage targets,
// citations are signal, not a gate: a 12-week-old company has no analyst
// coverage, no congressional hearings, no Wikipedia page. "Insufficient
// public data" is a valid output, not a failure.
//
// Three load-bearing rules across the section registry:
//
//   1. Citations annotate, never gate. The orchestrator validates URLs
//      (resolved / gated / dead) for UI display but never retries on
//      dead-citation rates. See src/app/api/research/route.ts.
//
//   2. Claims may be inferred. Set citation_url=null + inferred=true when
//      synthesizing from observable facts without a citable source.
//      Inventing URLs is forbidden; null + inferred is honest.
//
//   3. Founders is the only section that fails loud on empty findings.
//      schema.min(1) on founders[] forces a section_failed when no
//      founders are identifiable — the user needs to know they got the
//      wrong company or it's too stealth to research. Every other
//      section accepts empty arrays as a finding.
//
// Moat carries an additional pattern: per-axis replicability confidence
// (high/medium/low) parallel to per-axis reasoning. Confidence is
// orthogonal to score — a confident "no regulatory moat" is score 1-2,
// confidence: "high". See src/lib/sections/moat.ts.
//
// Do not flip citation_url back to required, do not reintroduce
// dead-citation retries, and do not loosen founders min(1) without
// rereading this comment.
import { z } from "zod";
import type { Citation, CompanyInput } from "./types";

export const claimSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  citation_url: z.string().url().nullable(),
  citation_quote: z.string().nullable(),
  inferred: z.boolean().default(false),
});

export const claimsSchema = z.array(claimSchema).default([]);

export type Claim = z.infer<typeof claimSchema>;

export function extractCitations(content: unknown): Citation[] {
  const claims =
    content && typeof content === "object" && "claims" in content
      ? (content as { claims?: Claim[] }).claims
      : undefined;
  if (!Array.isArray(claims)) return [];
  // Drop inferred claims (citation_url/quote are null): no URL to validate.
  // UI still renders them from content.claims.
  return claims
    .filter((c): c is Claim & { citation_url: string; citation_quote: string } =>
      typeof c.citation_url === "string" && typeof c.citation_quote === "string"
    )
    .map((c) => ({
      id: c.id,
      url: c.citation_url,
      quote: c.citation_quote,
      claim: c.text,
    }));
}

// JSON Schema string for inclusion in prompts. Models follow JSON Schema
// reliably; they invent fields when given prose-only field lists.
export function schemaForPrompt(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema), null, 2);
}

// Per-section prompt builder. Embeds the company identity (with one-line
// description for disambiguation), the literal JSON schema, and a one-shot
// example. The schema + example pair is what stops models from inventing
// field names.
export function buildSectionPrompt(opts: {
  company: CompanyInput;
  sectionTitle: string;
  sectionInstructions: string;
  schema: z.ZodType;
  example: object;
}): string {
  const { company, sectionTitle, sectionInstructions, schema, example } = opts;
  const domainStr = company.domain ? ` (${company.domain})` : "";
  const schemaJson = schemaForPrompt(schema);
  const exampleJson = JSON.stringify(example, null, 2);

  return `You are researching ${company.name}${domainStr} for Founderscope, an open-source research tool for technical founders.

Note: ${company.name} is ${company.one_line_description}.

SECTION: ${sectionTitle}

${sectionInstructions}

EARLY-STAGE SOURCE PRIORITY:
For founder-intel research, prioritize these sources in this order:
  1. YC Directory  (ycombinator.com/companies)  — canonical for YC cohorts.
  2. Wellfound     (wellfound.com)               — early-stage profiles, jobs, team size.
  3. LinkedIn                                     — founder bios, headcount, hiring signal.
  4. GitHub                                       — org activity, contributors, stack signals.
  5. SEC EDGAR     (Form D filings)               — angel/seed funding for US entities.
Cross-verification rule: if a concrete claim has fewer than 2 independent sources, mark
inferred=true on that claim or label the surrounding section confidence as "low". For
companies with fewer than 2 sources total, output "insufficient public data (est.)" in
the relevant string fields and set top-level confidence: "low" if the schema includes it.
Honesty beats false precision — early-stage gaps are signal, not failure.

STRICT OUTPUT RULES:
- Output ONE valid JSON object matching the schema below. No prose. No markdown. No code fences.
- Response MUST start with { and end with }.
- Use ONLY the field names defined in the schema. Do not add extra fields like "company_name", "notes", "summary_notes", "traction_signals", "quality_notes", etc. — they will be rejected.
- For enum fields, use ONLY the values in the schema's enum list verbatim. If unsure, use "Unknown" if the schema includes it as an option.
- For optional/nullable fields, use null when no data is available. Do not omit nullable fields.
- For arrays, return [] when empty. Do not omit array fields.

RESEARCH POSTURE:
- This is a founder-intel tool. Audience is technical founders, including those researching very early-stage companies (sub-12-month-old startups). Speak with opinion, not Wikipedia hedging.
- Run 3-5 web_search calls, then STOP searching and write the JSON. There is a hard cap of 8 searches per section; past it the tool returns an error telling you to answer with what you have. Spending every search is a failure mode, not thoroughness.
- Prefer primary sources: company site, SEC filings, founder interviews, engineering blogs, GitHub orgs, Wikipedia, Crunchbase public pages.
- Do not repeat a query you have already run. If a search returns nothing useful, change the wording or move on — re-running it costs one of your 8 and returns the same nothing.
- "Insufficient public data" is a valid finding, not a failure. For early-stage companies, missing data IS information — surface it explicitly ("pre-revenue, no published metrics", "stealth-mode, stack not findable").
- State that finding AS A CLAIM. The claims array must never be empty: if you found nothing citable, return at least one claim saying what you looked for and what was not findable, with inferred=true and citation_url=null. An empty claims array is rejected and the whole section is discarded.

CLAIMS POLICY:
- A claim with a real URL retrieved via web_search: set citation_url to that URL, citation_quote to the supporting passage, inferred=false.
- A claim inferred from observable facts (e.g. founder LinkedIn implies prior employer, public pricing page implies revenue model) without a single citable source: set citation_url=null, citation_quote=null, inferred=true. This is honest synthesis and is preferred over silence.
- NEVER invent URLs. NEVER cite a URL you did not actually retrieve. Missing citation > fabricated citation.
- Be willing to say "unknown" or "too early to assess" rather than fabricate. Honesty beats false precision.

JSON SCHEMA:
\`\`\`json
${schemaJson}
\`\`\`

EXAMPLE OUTPUT (schema-conformant; replace values with researched data for ${company.name}):
\`\`\`json
${exampleJson}
\`\`\`

Begin researching now using web_search. When done, output JSON only.`;
}
