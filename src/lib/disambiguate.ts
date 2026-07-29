// Pre-research disambiguation: pick the SPECIFIC company the user means
// before any section starts. Without this, parallel sections drift to
// different real-world entities for ambiguous names ("Bolt" → mobility vs
// Bolt.new vs Bolt Financial).
import { z } from "zod";
import { runResearchCall, type ProviderConfig } from "./llm";

// Deliberately permissive on emptiness. A `.min(1)` here would turn a model
// that got the name and domain right but skipped the description into a total
// schema failure, discarding the good fields — `normalizeDisambiguation` keeps
// what the model got right and fills the rest from the user's input instead.
export const DisambiguationSchema = z.object({
  canonical_name: z.string().trim(),
  canonical_domain: z.string().trim(),
  one_line_description: z.string().trim(),
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

  // Disambiguation is an optimization, not a hard requirement. If the model
  // returns unrecoverable JSON (or any other error), fall back to the user's
  // raw input as the canonical identity rather than aborting the whole research.
  const fallback: Disambiguation = {
    canonical_name: opts.name,
    canonical_domain: opts.domain ?? "",
    one_line_description: "",
    disambiguation_note: null,
  };

  try {
    const result = await runResearchCall({
      config: opts.config,
      tier: "default",
      prompt,
      schema: DisambiguationSchema,
      cacheKey: "founderscope:disambiguate",
    });
    return normalizeDisambiguation(result.data, opts.name, opts.domain);
  } catch (err) {
    // Not dev-gated. The first live run returned canonical_domain:"" and
    // one_line_description:"" for Linear and nothing said why — because this
    // branch ran and its warning was compiled out. Every section prompt is
    // built from these fields, so a silent fallback degrades all seven
    // sections at once and must be visible in production logs.
    console.error(
      `[disambiguate] failed for "${opts.name}"; falling back to raw input as canonical identity:`,
      (err as Error)?.message ?? err,
    );
    return fallback;
  }
}

/**
 * Keep whatever the model got right, fill the rest from the user's input.
 *
 * A model that answers with empty strings passes `z.string()` validation, so
 * without this the blanks flow straight into all seven section prompts as an
 * empty company name and an empty description. Filling `canonical_name` at
 * least keeps the prompts coherent; an empty description is survivable but
 * worth logging, because it is the difference between a grounded prompt and a
 * vague one.
 */
export function normalizeDisambiguation(
  data: Disambiguation,
  inputName: string,
  inputDomain: string | null,
): Disambiguation {
  const normalized: Disambiguation = {
    canonical_name: data.canonical_name.trim() || inputName,
    canonical_domain: data.canonical_domain.trim() || (inputDomain ?? ""),
    one_line_description: data.one_line_description.trim(),
    disambiguation_note: data.disambiguation_note?.trim() || null,
  };

  const blank = (
    ["canonical_name", "canonical_domain", "one_line_description"] as const
  ).filter((field) => data[field].trim().length === 0);

  if (blank.length > 0) {
    console.warn(
      `[disambiguate] model returned empty ${blank.join(", ")} for "${inputName}"; ` +
        "filled from user input where possible",
    );
  }

  return normalized;
}
