// Thin wrapper over POST https://api.exa.ai/search.
// We always use type=auto + contents.highlights=true; verbose text is too token-heavy
// for a tool-use loop and highlights give the model what it needs to summarize.
//
// Optional filter params (includeDomains/excludeDomains/startPublishedDate/livecrawl)
// are only sent when defined, so `exaSearch({query})` produces the same request
// shape as before — backward compat for the existing exa-client tests.
export interface ExaSearchInput {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string; // ISO date, e.g. "2024-01-01"
  livecrawl?: "always" | "fallback" | "never";
}

export interface ExaResult {
  title: string;
  url: string;
  highlights: string[];
}

export interface ExaSearchOutput {
  results: ExaResult[];
}

const EXA_ENDPOINT = "https://api.exa.ai/search";

export async function exaSearch(
  input: ExaSearchInput,
  apiKey: string,
): Promise<ExaSearchOutput> {
  const numResults = input.numResults ?? 5;
  const body: Record<string, unknown> = {
    query: input.query,
    type: "auto",
    numResults,
    contents: { highlights: true },
  };
  if (input.includeDomains && input.includeDomains.length > 0) {
    body.includeDomains = input.includeDomains;
  }
  if (input.excludeDomains && input.excludeDomains.length > 0) {
    body.excludeDomains = input.excludeDomains;
  }
  if (input.startPublishedDate) body.startPublishedDate = input.startPublishedDate;
  if (input.livecrawl) body.livecrawl = input.livecrawl;
  const res = await fetch(EXA_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EXA ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; highlights?: string[] }>;
  };

  return {
    results: (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      highlights: r.highlights ?? [],
    })),
  };
}

// Logo lookup. Best-effort: returns null on any failure so callers (e.g.
// findOrCreateCompany) can proceed without a logo. Prefers extras.imageLinks
// (usually og:image — a clean wordmark on company sites), then favicon.
const LOGO_TIMEOUT_MS = 5_000;

export async function exaCompanyLogo(
  input: { name: string; domain: string | null },
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    query: `${input.name} official site`,
    type: "auto",
    numResults: 1,
    contents: { extras: { imageLinks: 1 } },
  };
  if (input.domain) body.includeDomains = [input.domain];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
  try {
    const res = await fetch(EXA_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{
        favicon?: string;
        extras?: { imageLinks?: string[] };
      }>;
    };
    const top = json.results?.[0];
    if (!top) return null;
    const image = top.extras?.imageLinks?.[0];
    if (image) return image;
    if (top.favicon) return top.favicon;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
