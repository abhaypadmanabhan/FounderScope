import type { SearchBudget, SearchProvider, SearchUsage } from "./types";

export const SEARCH_BUDGET: Readonly<Record<SearchBudget["tier"], number>> = {
  default: 8,
  reasoning: 10,
};

export function createSearchBudget(
  tier: SearchBudget["tier"],
): SearchBudget {
  return { tier, used: 0 };
}

export function consumeSearchBudget(
  providerId: SearchProvider["id"],
  budget?: SearchBudget,
): void {
  if (!budget) return;
  if (budget.used >= SEARCH_BUDGET[budget.tier]) {
    throw new Error(`${providerId}_search budget exhausted`);
  }
  budget.used++;
}

export function createSearchUsage(): SearchUsage {
  return { calls: 0, cacheHits: 0, rateLimit429s: 0, fallbackHits: 0 };
}

export function mergeSearchUsage(
  into: SearchUsage,
  from: SearchUsage,
): SearchUsage {
  into.calls += from.calls;
  into.cacheHits += from.cacheHits;
  into.rateLimit429s += from.rateLimit429s;
  into.fallbackHits += from.fallbackHits;
  return into;
}
