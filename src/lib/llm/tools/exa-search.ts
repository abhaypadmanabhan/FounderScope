// Custom function tool the model invokes inside the tool-use loop. The handler
// catches EXA failures and returns a stringified error blob so the model can
// decide whether to retry with a different query rather than crashing the section.
import { exaSearch, type ExaSearchInput } from "./exa-client";

export const EXA_SEARCH_TOOL = {
  type: "custom" as const,
  name: "exa_search",
  description:
    "Search the public web. Returns a list of {title, url, highlights} hits. " +
    "Use this for company facts, founder bios, funding rounds, news. " +
    "When you cite a fact in your output's `claims`, use the URL from these results.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const },
      num_results: { type: "integer" as const, default: 5, minimum: 1, maximum: 10 },
    },
    required: ["query"] as const,
  },
};

export async function handleExaSearch(
  input: { query: string; num_results?: number },
  exaKey: string,
): Promise<string> {
  const search: ExaSearchInput = {
    query: input.query,
    numResults: input.num_results,
  };
  try {
    const out = await exaSearch(search, exaKey);
    return JSON.stringify(out);
  } catch (err) {
    return JSON.stringify({
      error: (err as Error).message ?? "EXA call failed",
      results: [],
    });
  }
}
