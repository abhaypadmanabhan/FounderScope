// Section 3 — Founders: per-founder cards with bio sheet.
//
// Avatar strategy is three-tier:
//   1. photo_url (model captures Wikipedia/Wikimedia only — durable URLs)
//   2. derived github avatar (https://github.com/{handle}.png?size=200) for
//      founders whose github_url surfaced
//   3. designed initials fallback (most founders, especially non-famous, hit
//      this and it should look intentional, not "missing photo")
//
// Renderer + SkeletonRenderer live in founders-view.tsx ("use client").
// This module stays server-importable so the orchestrator can read schema
// and prompt without dragging client-only code into the server bundle.
import { z } from "zod";
import type { SectionDefinition } from "./types";
import { buildSectionPrompt, claimsSchema } from "./shared";
import { FoundersRenderer, FoundersSkeletonRenderer } from "./founders-view";

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
        github_url: z.string().url().nullable(),
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
export type FoundersOutput = z.infer<typeof outputSchema>;
export type Founder = FoundersOutput["founders"][number];

// Reserved (non-user) GitHub paths that look like /handle but aren't.
const GH_RESERVED = new Set([
  "orgs", "topics", "collections", "trending", "sponsors", "marketplace",
  "explore", "pricing", "features", "settings", "login", "join", "logout",
  "new", "about", "contact", "security", "site", "enterprise",
]);

export function parseGithubHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)/i);
  if (!m) return null;
  const handle = m[1];
  if (GH_RESERVED.has(handle.toLowerCase())) return null;
  return handle;
}

export type AvatarTier =
  | { kind: "photo"; url: string }
  | { kind: "github"; url: string };

export function avatarTiers(f: Pick<Founder, "photo_url" | "github_url">): AvatarTier[] {
  const out: AvatarTier[] = [];
  if (f.photo_url) out.push({ kind: "photo", url: f.photo_url });
  const handle = parseGithubHandle(f.github_url);
  if (handle) {
    out.push({ kind: "github", url: `https://github.com/${handle}.png?size=200` });
  }
  return out;
}

export const founders: SectionDefinition<FoundersOutput> = {
  key: "founders",
  title: "Founders",
  order: 3,
  cacheTtlDays: 30,
  schemaVersion: 3,
  tier: "default",
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

DIRECTED LINK COLLECTION — do these searches actively, don't wait for links to surface incidentally:

- linkedin_url: Search '[founder name] [company name] linkedin' and extract the canonical https://www.linkedin.com/in/[handle] URL. This is usually findable for any public founder.
- github_url: For founders with technical: true, search '[founder name] github' and capture the URL ONLY if a search result confirms a personal GitHub profile (https://github.com/[handle]). Do NOT guess based on common username patterns; null is correct when unconfirmed.
- photo_url: ONLY capture from Wikipedia/Wikimedia Commons URLs (upload.wikimedia.org/...). These are durable and licensed for reuse. Do NOT capture photo URLs from LinkedIn, Crunchbase, news sites, company about pages, or any other source — those URLs rot via CDN tokens, ToS, or referrer rules and break cached reports. The renderer has a designed initials fallback; null is honest.
- personal_site: Capture if a clear personal portfolio/blog exists. Optional, low priority.
- twitter_url: Capture the canonical https://twitter.com/[handle] or https://x.com/[handle] URL if findable from search results.

Set the corresponding claim's inferred: false only when you have a real cited source for the link. If you guessed or extrapolated, leave the field null — null is honest, a guess is a bug.

COST NOTE: 1–2 extra web_search calls per founder for these directed lookups is fine. Don't burn searches on personal_site if early hits don't surface one — that field is low priority.

- claims: cite every concrete fact (college, prior company, role, link) with a real URL where possible. If a fact is observable but unsourced, citation_url/quote: null and inferred: true.`,
      schema: outputSchema,
      example: {
        founders: [
          {
            name: "Dario Amodei",
            role: "CEO",
            photo_url:
              "https://upload.wikimedia.org/wikipedia/commons/example/Dario_Amodei.jpg",
            linkedin_url: "https://www.linkedin.com/in/dario-amodei-3934934/",
            twitter_url: "https://twitter.com/DarioAmodei",
            personal_site: null,
            github_url: null,
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
            github_url: null,
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
  Renderer: FoundersRenderer,
  SkeletonRenderer: FoundersSkeletonRenderer,
};
