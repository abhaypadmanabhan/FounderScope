// Custom function tool the model invokes inside the tool-use loop. The handler
// catches EXA failures and returns a stringified error blob so the model can
// decide whether to retry with a different query rather than crashing the section.
import { exaSearch, type ExaSearchInput } from "./exa-client";

export const EXA_SEARCH_TOOL = {
  type: "custom" as const,
  name: "exa_search",
  description:
    "Search the public web. Returns a list of {title, url, highlights} hits. " +
    "Use for company facts, founder bios, funding rounds, news. " +
    "When you cite a fact in your output's `claims`, use the URL from these results. " +
    "Budget: aim for 3-5 searches per task. Quality matters more than quantity. " +
    "After gathering enough information, stop searching and write the final JSON answer.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const },
      num_results: { type: "integer" as const, default: 5, minimum: 1, maximum: 10 },
    },
    required: ["query"] as const,
  },
};

/**
 * OpenAI-compat tool definition for the Kimi adapter. Same name + schema as
 * EXA_SEARCH_TOOL so the rest of the code path (handleExaSearch) stays shared.
 */
export function openaiExaToolDef() {
  return {
    type: "function" as const,
    function: {
      name: EXA_SEARCH_TOOL.name,
      description: EXA_SEARCH_TOOL.description,
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const },
          num_results: {
            type: "integer" as const,
            default: 5,
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["query"] as const,
        additionalProperties: false,
      },
    },
  };
}

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
