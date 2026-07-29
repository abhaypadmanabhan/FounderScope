import type { SearchBudget, SearchProvider, SearchUsage } from "./types";

export const SEARCH_BUDGET_EXHAUSTED_INSTRUCTION =
  "Write your final JSON answer now using prior search results. Do not call exa_search again.";

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
  budget: SearchBudget,
): void {
  if (budget.used >= SEARCH_BUDGET[budget.tier]) {
    throw new SearchBudgetExhaustedError(providerId);
  }
  budget.used++;
}

export class SearchBudgetExhaustedError extends Error {
  readonly code = "search_budget_exhausted";
  readonly instruction = SEARCH_BUDGET_EXHAUSTED_INSTRUCTION;

  constructor(readonly providerId: SearchProvider["id"]) {
    super("exa_search budget exhausted");
    this.name = "SearchBudgetExhaustedError";
  }
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
