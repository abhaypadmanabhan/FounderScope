import { z } from "zod";
import { responseError } from "./http";
import type { SearchRequest } from "./request";
import type { SearchResult } from "./types";

const EXA_ENDPOINT = "https://api.exa.ai/search";

const exaResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export async function exaSearch(
  input: SearchRequest,
  apiKey: string,
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = {
    query: input.query,
    type: "auto",
    numResults: input.numResults ?? 5,
    contents: { highlights: true },
  };
  if (input.includeDomains && input.includeDomains.length > 0) {
    body.includeDomains = input.includeDomains;
  }
  if (input.excludeDomains && input.excludeDomains.length > 0) {
    body.excludeDomains = input.excludeDomains;
  }
  if (input.startPublishedDate) {
    body.startPublishedDate = input.startPublishedDate;
  }
  if (input.livecrawl) {
    body.livecrawl = input.livecrawl;
  }

  const response = await fetch(EXA_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError("EXA", response);

  const parsed = exaResponseSchema.parse(await response.json());
  return (parsed.results ?? []).map((result) => ({
    title: result.title ?? "",
    url: result.url ?? "",
    highlights: result.highlights ?? [],
  }));
}
