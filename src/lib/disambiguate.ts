// Pre-research disambiguation: pick the SPECIFIC company the user means
// before any section starts. Without this, parallel sections drift to
// different real-world entities for ambiguous names ("Bolt" → mobility vs
// Bolt.new vs Bolt Financial).
import { z } from "zod";
import { runResearchCall } from "./anthropic";
import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./sections/types";

export const DisambiguationSchema = z.object({
  canonical_name: z.string(),
  canonical_domain: z.string(),
  one_line_description: z.string(),
  disambiguation_note: z.string().nullable(),
});
export type Disambiguation = z.infer<typeof DisambiguationSchema>;

export async function disambiguateCompany(opts: {
  apiKey: string;
  name: string;
  domain: string | null;
}): Promise<Disambiguation> {
  const domainHint = opts.domain ? ` (suggested domain: ${opts.domain})` : "";
  const prompt = `The user wants research on a company called "${opts.name}"${domainHint}.

Use web_search (1-3 searches max) to identify the SPECIFIC company they likely mean.

If multiple companies share this name, pick the one that:
  1. Matches the suggested domain if provided.
  2. Otherwise the most prominent for a technical-founder audience (likely a tech startup, not a hardware brand or unrelated consumer product).

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
    apiKey: opts.apiKey,
    model: DEFAULT_MODEL,
    webSearchVersion: DEFAULT_WEB_SEARCH,
    prompt,
    schema: DisambiguationSchema,
  });
  return result.data;
}
