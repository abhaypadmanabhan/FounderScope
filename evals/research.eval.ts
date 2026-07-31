import * as fs from "node:fs";
import * as path from "node:path";
import { evalite } from "evalite";
import { vi } from "vitest";
import { allowlistForSection } from "@/lib/search/domains";
import { SECTIONS } from "@/lib/sections/registry";
import { extractCitations } from "@/lib/sections/shared";
import type { Citation, CompanyInput } from "@/lib/sections/types";
import {
  EARLY_STAGE_COMPANIES,
  ENTERPRISE_COMPANIES,
  GOLDEN_SET,
} from "./golden-set";
import { GROUND_TRUTH } from "./ground-truth";
import {
  limitEvalRows,
  partitionEvalRowsByGroundTruth,
} from "./limit";
import {
  RESEARCH_QUALITY_SCORERS,
  RESEARCH_SCORERS,
  factualAccuracy,
} from "./scorers";
import type { GoldenCompany, ResearchEvalOutput } from "./types";

/**
 * Offline fixtures are the default and cannot reach OpenRouter or search.
 * Set FOUNDER_SCOPE_EVAL_LIVE=true explicitly to use OPENROUTER_API_KEY and
 * EXA_API_KEY for a paid, networked run.
 *
 * READ THE SCORES FROM AN OFFLINE RUN AS A HARNESS CHECK, NOT A QUALITY SIGNAL.
 * The offline runner replays one stored Anthropic report for every company in
 * the golden set, so factual-accuracy is comparing Anthropic's facts against
 * Shopify's ground truth and scoring exactly what you would expect. What an
 * offline run proves is that all 20 rows execute, every scorer returns, and
 * nothing reaches the network. Only a live run says anything about the product.
 */
export interface ResearchRunner {
  (company: GoldenCompany): Promise<ResearchEvalOutput>;
}

interface FixtureSection {
  content: unknown;
}

interface ResearchFixture {
  sections: Record<string, FixtureSection>;
}

const LIVE_EVAL_FLAG = "FOUNDER_SCOPE_EVAL_LIVE";

// Seven live section calls against a real model take minutes; evalite 0.12
// defaults to 30s and has no config file. Scoped to this file so the unit suite
// keeps failing fast.
vi.setConfig({
  testTimeout: process.env[LIVE_EVAL_FLAG] === "true" ? 900_000 : 30_000,
});
let fixture: ResearchFixture | null = null;
let defaultRunner: Promise<ResearchRunner> | null = null;

function loadFixture(): ResearchFixture {
  if (fixture) return fixture;
  const fixturePath = path.resolve(
    process.cwd(),
    "__fixtures__/research-anthropic.json"
  );
  fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as ResearchFixture;
  return fixture;
}

function fixtureRunner(): ResearchRunner {
  return async (company) => {
    const stored = loadFixture();
    const sections = SECTIONS.map((section) => {
      const content = section.outputSchema.parse(
        stored.sections[section.key]?.content
      );
      return {
        sectionKey: section.key,
        content,
        citations: extractCitations(content).map((citation) => ({
          ...citation,
          status: "resolved" as const,
        })),
      };
    });
    return { company, sections };
  };
}

function requiredLiveKey(name: "OPENROUTER_API_KEY" | "EXA_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${LIVE_EVAL_FLAG}=true requires ${name}; unset ${LIVE_EVAL_FLAG} for the free offline eval.`
    );
  }
  return value;
}

async function liveRunner(): Promise<ResearchRunner> {
  const [{ runResearchCall }, { validateCitations }] = await Promise.all([
    import("@/lib/llm"),
    import("@/lib/citations"),
  ]);
  const config = {
    openrouterKey: requiredLiveKey("OPENROUTER_API_KEY"),
    searchKey: requiredLiveKey("EXA_API_KEY"),
    searchProvider: "exa" as const,
  };

  return async (company) => {
    const companyInput: CompanyInput = {
      name: company.name,
      domain: company.domain,
      slug: company.domain,
      one_line_description: `${company.name} at ${company.domain}`,
    };
    // The golden set already carries a maturity label, so the eval uses it
    // directly rather than paying for the disambiguation call production makes.
    const sections = await Promise.all(
      SECTIONS.map(async (section) => {
        const result = await runResearchCall({
          config,
          tier: section.tier,
          prompt: section.buildPrompt(companyInput),
          schema: section.outputSchema,
          cacheKey: section.cacheKey,
          // Must match route.ts. Omitting it made a paid live run measure an
          // ungrounded configuration while domain-adherence graded its citations
          // against the allowlist that run never applied.
          includeDomains: [
            ...allowlistForSection(
              section.key,
              company.maturity,
              company.domain,
            ),
          ],
        });
        const rawCitations = extractCitations(result.data);
        const statuses = await validateCitations(rawCitations);
        const citations: Citation[] = rawCitations.map((citation, index) => ({
          ...citation,
          status: statuses[index],
        }));
        return {
          sectionKey: section.key,
          content: result.data,
          citations,
        };
      })
    );
    return { company, sections };
  };
}

async function getDefaultRunner(): Promise<ResearchRunner> {
  if (!defaultRunner) {
    defaultRunner =
      process.env[LIVE_EVAL_FLAG] === "true"
        ? liveRunner()
        : Promise.resolve(fixtureRunner());
  }
  return defaultRunner;
}

export async function runResearchEval(
  company: GoldenCompany,
  runner?: ResearchRunner
): Promise<ResearchEvalOutput> {
  return (runner ?? (await getDefaultRunner()))(company);
}

/**
 * Caps rows per suite. Exists for live runs: the golden set is 20 companies and
 * a live run bills every section of every one, so proving the harness works
 * end-to-end should cost two companies, not twenty. Unset means the whole set,
 * which is the right default offline where rows are free.
 */
/**
 * Columns shared by both suites.
 *
 * `graded` makes factual coverage visible. Evalite 0.12 stores null scores as
 * zero, so rows are partitioned below: measured rows receive every scorer,
 * while unmeasured rows receive only the quality scorers. That keeps absent
 * ground truth out of both row scores and aggregate factual accuracy.
 */
function researchColumns({ output }: { output: unknown }) {
  const result = output as ResearchEvalOutput;
  return [
    { label: "company", value: result.company.name },
    { label: "maturity", value: result.company.maturity },
    { label: "graded", value: factualAccuracy(result).gradedFields.length },
  ];
}

function registerResearchSuites(
  label: string,
  companies: GoldenCompany[]
): void {
  const limited = limitEvalRows(
    companies,
    process.env.FOUNDER_SCOPE_EVAL_LIMIT
  );
  const data = partitionEvalRowsByGroundTruth(limited, GROUND_TRUTH);

  if (data.measured.length > 0) {
    evalite(`research — ${label} — measured`, {
      data: () => data.measured.map((company) => ({ input: company })),
      task: async (company) => runResearchEval(company),
      scorers: [...RESEARCH_SCORERS],
      columns: researchColumns,
    });
  }

  if (data.unmeasured.length > 0) {
    evalite(`research — ${label} — unmeasured`, {
      data: () => data.unmeasured.map((company) => ({ input: company })),
      task: async (company) => runResearchEval(company),
      scorers: [...RESEARCH_QUALITY_SCORERS],
      columns: researchColumns,
    });
  }
}

registerResearchSuites("early-stage golden set", EARLY_STAGE_COMPANIES);
registerResearchSuites("enterprise golden set", ENTERPRISE_COMPANIES);

// Sanity export so the golden set is referenced at module load (lint-friendly).
export const GOLDEN_SET_SIZE = GOLDEN_SET.length;
