import { createScorer } from "evalite";
import type { ResearchEvalOutput } from "../types";
import { aggregateClaimCounts, citationFillRate } from "./claims";
import { aggregateDeadLinkRate } from "./dead-link-rate";
import { aggregateDomainAdherence } from "./domain-adherence";
import { scoreSchemaPass } from "./schema-pass";

export { scoreSchemaPass } from "./schema-pass";
export { countClaims, aggregateClaimCounts, citationFillRate } from "./claims";
export { deadLinkRate, aggregateDeadLinkRate } from "./dead-link-rate";
export {
  domainAdherenceForSection,
  aggregateDomainAdherence,
} from "./domain-adherence";

export function computeMetrics(output: ResearchEvalOutput) {
  const claims = aggregateClaimCounts(output.sections);
  return {
    schemaPass: scoreSchemaPass(output),
    citationFillRate: citationFillRate(claims),
    deadLinkRate: aggregateDeadLinkRate(output.sections),
    domainAdherence: aggregateDomainAdherence(output),
  };
}

export const schemaPassScorer = createScorer({
  name: "schema-pass",
  description: "Zod validation succeeded for all section outputs",
  scorer: ({ output }) => scoreSchemaPass(output as ResearchEvalOutput),
});

export const citationFillRateScorer = createScorer({
  name: "citation-fill-rate",
  description: "cited_claims / total_claims across all sections",
  scorer: ({ output }) => {
    const o = output as ResearchEvalOutput;
    const rate = citationFillRate(aggregateClaimCounts(o.sections));
    return rate ?? 0;
  },
});

export const deadLinkRateScorer = createScorer({
  name: "dead-link-rate",
  description: "Fraction of citations with status dead (lower is better)",
  scorer: ({ output }) => {
    const o = output as ResearchEvalOutput;
    const rate = aggregateDeadLinkRate(o.sections);
    // Invert: 1 = no dead links, 0 = all dead
    return rate === null ? 1 : 1 - rate;
  },
});

export const domainAdherenceScorer = createScorer({
  name: "domain-adherence",
  description: "Fraction of citations inside the section domain allowlist",
  scorer: ({ output }) => {
    const rate = aggregateDomainAdherence(output as ResearchEvalOutput);
    return rate ?? 0;
  },
});

export const RESEARCH_SCORERS = [
  schemaPassScorer,
  citationFillRateScorer,
  deadLinkRateScorer,
  domainAdherenceScorer,
] as const;
