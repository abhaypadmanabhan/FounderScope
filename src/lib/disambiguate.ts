// Pre-research disambiguation: pick the SPECIFIC company the user means
// before any section starts. Without this, parallel sections drift to
// different real-world entities for ambiguous names ("Bolt" → mobility vs
// Bolt.new vs Bolt Financial).
import { z } from "zod";
import { runResearchCall, type ProviderConfig } from "./llm";

export const DisambiguationSchema = z.object({
  canonical_name: z.string(),
  canonical_domain: z.string(),
  one_line_description: z.string(),
  disambiguation_note: z.string().nullable(),
});
export type Disambiguation = z.infer<typeof DisambiguationSchema>;

export async function disambiguateCompany(opts: {
  config: ProviderConfig;
  name: string;
  domain: string | null;
}): Promise<Disambiguation> {
  const domainHint = opts.domain ? ` (suggested domain: ${opts.domain})` : "";
  const prompt = `The user wants research on a company called "${opts.name}"${domainHint}.

Use web_search (1-3 searches max) to identify the SPECIFIC company they likely mean.

If multiple companies share this name, pick the one that:
  1. Matches the suggested domain if provided.
  2. Otherwise the most prominent for a technical-founder audience (likely a tech startup, not a hardware brand or unrelated consumer product).

PREFERRED CANONICAL SOURCES:
  - YC Directory (ycombinator.com/companies) — gives canonical name + domain for YC cos.
  - Wellfound (wellfound.com) — startup profiles with verified domains.
  - Crunchbase public pages — fallback for non-YC startups.
For ambiguous names, run one \`site:\` search against the suggested domain before deciding.

STRICT OUTPUT RULES:
- Output ONE JSON object. No prose. No markdown. No code fences.
- Response MUST start with { and end with }.
- canonical_name: official name as it appears on their site or Wikipedia. A disambiguating suffix is fine (e.g. "Bolt Financial Inc." or "Bolt.new (StackBlitz)").
- canonical_domain: primary domain only (e.g. "bolt.com"). No protocol, no path, no www.
- one_line_description: <= 20 words describing what the company does.
- disambiguation_note: if other notable companies share this name and you ruled them out, list them in one sentence (e.g. "Not the Estonian mobility platform Bolt or Bolt Financial."). Otherwise null.

JSON SCHEMA:
\`\`\`json
{
  "type": "object",
  "properties": {
    "canonical_name": { "type": "string" },
    "canonical_domain": { "type": "string" },
    "one_line_description": { "type": "string" },
    "disambiguation_note": { "type": ["string", "null"] }
  },
  "required": ["canonical_name", "canonical_domain", "one_line_description", "disambiguation_note"]
}
\`\`\`

EXAMPLE OUTPUT:
\`\`\`json
{
  "canonical_name": "Bolt Financial Inc.",
  "canonical_domain": "bolt.com",
  "one_line_description": "One-click checkout and identity platform for online retailers.",
  "disambiguation_note": "Not the Estonian mobility platform Bolt (bolt.eu) or the AI codegen tool Bolt.new (bolt.new)."
}
\`\`\`

Begin researching now using web_search. When done, output JSON only.`;

  const result = await runResearchCall({
    config: opts.config,
    tier: "default",
    prompt,
    schema: DisambiguationSchema,
    cacheKey: "founderscope:disambiguate",
  });
  return result.data;
}
