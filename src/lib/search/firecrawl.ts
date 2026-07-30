import { z } from "zod";
import { responseError } from "./http";
import type { RawSearchProvider, SearchResult } from "./types";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/search";

const firecrawlResponseSchema = z.object({
  data: z
    .object({
      web: z
        .array(
          z.object({
            title: z.string().optional(),
            url: z.string().optional(),
            description: z.string().optional(),
            markdown: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export function createFirecrawlProvider(apiKey: string): RawSearchProvider {
  return {
    id: "firecrawl",
    async search(query, request): Promise<SearchResult[]> {
      const body: Record<string, unknown> = {
        query,
        limit: request.numResults ?? 5,
      };
      if (request.includeDomains && request.includeDomains.length > 0) {
        body.includeDomains = request.includeDomains;
      }
      if (request.excludeDomains && request.excludeDomains.length > 0) {
        body.excludeDomains = request.excludeDomains;
      }

      const response = await fetch(FIRECRAWL_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await responseError("FIRECRAWL", response);

      const parsed = firecrawlResponseSchema.parse(await response.json());
      return (parsed.data?.web ?? []).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        highlights: [result.description ?? result.markdown ?? ""].filter(
          (highlight) => highlight.length > 0,
        ),
      }));
    },
  };
}
