// Thin wrapper over POST https://api.exa.ai/search.
// We always use type=auto + contents.highlights=true; verbose text is too token-heavy
// for a tool-use loop and highlights give the model what it needs to summarize.
export interface ExaSearchInput {
  query: string;
  numResults?: number;
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
  const res = await fetch(EXA_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      type: "auto",
      numResults,
      contents: { highlights: true },
    }),
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
