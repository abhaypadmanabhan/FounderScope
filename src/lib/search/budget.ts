import type { SearchBudget, SearchProvider, SearchUsage } from "./types";

// Deliberately does NOT name the search tool. The search layer does not own the
// tool name — the LLM layer does (SEARCH_TOOL_NAME) and appends it. A copy of the
// name here is what left the model being told to stop calling `exa_search` after
// the tool was renamed to `web_search`.
export const SEARCH_BUDGET_EXHAUSTED_INSTRUCTION =
  "Write your final JSON answer now using prior search results.";

export const SEARCH_BUDGET: Readonly<Record<SearchBudget["tier"], number>> = {
  default: 8,
  reasoning: 10,
  // One paid logo lookup per request, enforced rather than assumed. A request
  // inserts at most one company row, so 1 is the real ceiling — writing 8 here
  // would restore the accounting theatre this tier exists to remove.
  logo: 1,
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
    super(`${providerId} search budget exhausted`);
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
