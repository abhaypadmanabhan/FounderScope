import { z } from "zod";
import { responseError } from "./http";
import type { RawSearchProvider, SearchResult } from "./types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

const tavilyResultSchema = z.object({
  title: z.string().nullish(),
  url: z.string().nullish(),
  content: z.string().nullish(),
});

const tavilyResponseSchema = z.object({
  results: z.array(tavilyResultSchema.nullish()).nullish(),
});

export function createTavilyProvider(apiKey: string): RawSearchProvider {
  return {
    id: "tavily",
    async search(query, request): Promise<SearchResult[]> {
      const body: Record<string, unknown> = {
        query,
        max_results: request.numResults ?? 5,
        search_depth: "basic",
      };
      if (request.includeDomains && request.includeDomains.length > 0) {
        body.include_domains = request.includeDomains;
      }
      if (request.excludeDomains && request.excludeDomains.length > 0) {
        body.exclude_domains = request.excludeDomains;
      }
      if (request.startPublishedDate) {
        body.start_date = request.startPublishedDate.slice(0, 10);
      }

      const response = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await responseError("TAVILY", response);

      const parsed = tavilyResponseSchema.parse(await response.json());
      return (parsed.results ?? [])
        .filter(
          (result): result is z.infer<typeof tavilyResultSchema> =>
            result != null,
        )
        .map((result) => ({
          title: result.title ?? "",
          url: result.url ?? "",
          highlights: result.content ? [result.content] : [],
        }))
        .filter((result) => result.url !== "");
    },
  };
}
