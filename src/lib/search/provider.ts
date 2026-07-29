import { z } from "zod";
import { createExaProvider } from "./exa";
import { createFirecrawlProvider } from "./firecrawl";
import { createTavilyProvider } from "./tavily";
import type { SearchProvider } from "./types";

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

  switch (parsed.data) {
    case "exa":
      return createExaProvider(apiKey);
    case "firecrawl":
      return createFirecrawlProvider(apiKey);
    case "tavily":
      return createTavilyProvider(apiKey);
  }
}
