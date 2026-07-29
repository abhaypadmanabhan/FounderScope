import type { SearchRequest } from "./request";

export interface SearchResult {
  title: string;
  url: string;
  highlights: string[];
}

export interface SearchOptions {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  livecrawl?: "always" | "fallback" | "never";
  /**
   * Required, and required on purpose. One budget per model call, sized by
   * tier with `createSearchBudget`. When this was optional the cap silently
   * did not exist; when the policy wrapper made it mandatory at runtime but
   * left it optional in the type, omitting it became a TypeError inside a tool
   * callback instead. Keeping it non-optional makes the mistake a compile
   * error, which is the only version of it that is cheap to find.
   */
  budget: SearchBudget;
  usage?: SearchUsage;
}

export interface SearchProvider {
  readonly id: "exa" | "firecrawl" | "tavily";
  search(query: string, opts: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchBudget {
  readonly tier: "default" | "reasoning";
  used: number;
}

export interface SearchUsage {
  calls: number;
  cacheHits: number;
  rateLimit429s: number;
  fallbackHits: number;
}

export interface RawSearchProvider {
  readonly id: SearchProvider["id"];
  search(query: string, request: SearchRequest): Promise<SearchResult[]>;
}
