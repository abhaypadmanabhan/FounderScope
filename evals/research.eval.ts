import { evalite } from "evalite";
import {
  EARLY_STAGE_COMPANIES,
  ENTERPRISE_COMPANIES,
  GOLDEN_SET,
} from "./golden-set";
import { RESEARCH_SCORERS } from "./scorers";
import type { GoldenCompany, ResearchEvalOutput } from "./types";

/**
 * Scaffold eval — task wiring lands in phase B1 when the OpenRouter LLM layer
 * replaces the Anthropic/Kimi adapters. Until then the task throws so accidental
 * runs fail fast instead of silently succeeding.
 */
async function runResearchEval(
  _company: GoldenCompany
): Promise<ResearchEvalOutput> {
  throw new Error(
    "Research eval task not wired yet — complete phase B1 (OpenRouter LLM layer) first."
  );
}

evalite("research — early-stage golden set", {
  data: EARLY_STAGE_COMPANIES.map((company) => ({
    input: company,
  })),
  task: async (company) => runResearchEval(company),
  scorers: [...RESEARCH_SCORERS],
  columns: ({ output }) => [
    { label: "company", value: (output as ResearchEvalOutput).company.name },
    {
      label: "maturity",
      value: (output as ResearchEvalOutput).company.maturity,
    },
  ],
});

evalite("research — enterprise golden set", {
  data: ENTERPRISE_COMPANIES.map((company) => ({
    input: company,
  })),
  task: async (company) => runResearchEval(company),
  scorers: [...RESEARCH_SCORERS],
  columns: ({ output }) => [
    { label: "company", value: (output as ResearchEvalOutput).company.name },
    {
      label: "maturity",
      value: (output as ResearchEvalOutput).company.maturity,
    },
  ],
});

// Sanity export so the golden set is referenced at module load (lint-friendly).
export const GOLDEN_SET_SIZE = GOLDEN_SET.length;
