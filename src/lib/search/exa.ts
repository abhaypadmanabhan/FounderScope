import { exaSearch } from "./exa-client";
import type { RawSearchProvider } from "./types";

export function createExaProvider(apiKey: string): RawSearchProvider {
  return {
    id: "exa",
    async search(query, request) {
      return exaSearch({ ...request, query }, apiKey);
    },
  };
}
