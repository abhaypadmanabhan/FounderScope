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
