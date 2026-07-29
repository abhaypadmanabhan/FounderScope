import { z } from "zod";
import { createExaProvider } from "./exa";
import { createFirecrawlProvider } from "./firecrawl";
import { withSearchPolicy } from "./policy";
import { createTavilyProvider } from "./tavily";
import type { RawSearchProvider, SearchProvider } from "./types";

const searchProviderIdSchema = z
  .enum(["exa", "firecrawl", "tavily"])
  .default("exa");

export function createSearchProvider(
  id: string | null | undefined,
  apiKey: string,
): SearchProvider {
  const parsed = searchProviderIdSchema.safeParse(id ?? undefined);
  if (!parsed.success) {
    throw new Error(`Unsupported search provider: ${id}`);
  }

  let backend: RawSearchProvider;
  switch (parsed.data) {
    case "exa":
      backend = createExaProvider(apiKey);
      break;
    case "firecrawl":
      backend = createFirecrawlProvider(apiKey);
      break;
    case "tavily":
      backend = createTavilyProvider(apiKey);
      break;
  }
  return withSearchPolicy(backend);
}
