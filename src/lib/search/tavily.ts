import { z } from "zod";
import { responseError } from "./http";
import type { SearchOptions, SearchProvider, SearchResult } from "./types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
});

export function createTavilyProvider(apiKey: string): SearchProvider {
  return {
    id: "tavily",
    async search(query: string, opts: SearchOptions): Promise<SearchResult[]> {
      const body: Record<string, unknown> = {
        query,
        max_results: opts.numResults ?? 5,
        search_depth: "basic",
      };
      if (opts.includeDomains && opts.includeDomains.length > 0) {
        body.include_domains = opts.includeDomains;
      }
      if (opts.excludeDomains && opts.excludeDomains.length > 0) {
        body.exclude_domains = opts.excludeDomains;
      }
      if (opts.startPublishedDate) {
        body.start_date = opts.startPublishedDate;
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
      return (parsed.results ?? []).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        highlights: result.content ? [result.content] : [],
      }));
    },
  };
}
