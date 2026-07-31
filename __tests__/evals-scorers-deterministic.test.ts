import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  EARLY_STAGE_COMPANIES,
  ENTERPRISE_COMPANIES,
  GOLDEN_SET,
} from "../evals/golden-set";
import { urlMatchesAllowlist } from "../evals/domains";
import {
  aggregateClaimCounts,
  citationFillRate,
  countClaims,
} from "../evals/scorers/claims";
import {
  aggregateDeadLinkRate,
  deadLinkRate,
} from "../evals/scorers/dead-link-rate";
import {
  aggregateDomainAdherence,
  domainAdherenceForSection,
} from "../evals/scorers/domain-adherence";
import {
  computeMetrics,
  RESEARCH_QUALITY_SCORERS,
  RESEARCH_SCORERS,
  schemaPassScorer,
} from "../evals/scorers";
import {
  aggregateFactualAccuracy,
  factualAccuracy,
  factualAccuracyScorer,
  normalizeCountry,
  tickerMatches,
} from "../evals/scorers/factual-accuracy";
import { scoreSchemaPass, sectionSchemaPasses } from "../evals/scorers/schema-pass";
import {
  earlyStageFixture,
  enterpriseFixture,
} from "../evals/fixtures/scorer-fixtures";
import { SECTIONS } from "@/lib/sections/registry";
import type {
  ExpectedFacts,
  GroundTruth,
  ResearchEvalOutput,
} from "../evals/types";

describe("golden set", () => {
  it("has 20 companies split 10 early-stage / 10 enterprise", () => {
    expect(GOLDEN_SET).toHaveLength(20);
    expect(EARLY_STAGE_COMPANIES).toHaveLength(10);
    expect(ENTERPRISE_COMPANIES).toHaveLength(10);
    for (const company of GOLDEN_SET) {
      expect(company.name).toBeTruthy();
      expect(company.domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/i);
      expect(["early-stage", "enterprise"]).toContain(company.maturity);
    }
  });
});

describe("schema-pass scorer", () => {
  it("scores 1 when all fixture sections pass Zod validation", () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "__fixtures__/research-anthropic.json"),
        "utf-8"
      )
    ) as { sections: Record<string, { content: unknown }> };

    const output = {
      company: earlyStageFixture.company,
      sections: SECTIONS.map((section) => ({
        sectionKey: section.key,
        content: fixture.sections[section.key]?.content,
        citations: [],
      })),
    };

    expect(scoreSchemaPass(output)).toBe(1);
  });

  it("returns 0 for unknown section keys", () => {
    expect(
      scoreSchemaPass({
        company: earlyStageFixture.company,
        sections: [{ sectionKey: "nope", content: {}, citations: [] }],
      })
    ).toBe(0);
  });

  it("sectionSchemaPasses matches registry for snapshot fixture", () => {
    const content = (
      JSON.parse(
        fs.readFileSync(
          path.resolve(process.cwd(), "__fixtures__/research-anthropic.json"),
          "utf-8"
        )
      ) as { sections: { snapshot: { content: unknown } } }
    ).sections.snapshot.content;

    expect(sectionSchemaPasses("snapshot", content)).toBe(true);
  });
});

describe("citation fill-rate scorer", () => {
  it("counts cited vs total claims like route.ts", () => {
    const snapshot = earlyStageFixture.sections[0];
    expect(countClaims(snapshot.content)).toEqual({
      totalClaims: 2,
      citedClaims: 1,
    });
  });

  it("computes aggregate fill rate across sections", () => {
    const counts = aggregateClaimCounts(earlyStageFixture.sections);
    expect(counts).toEqual({ totalClaims: 3, citedClaims: 2 });
    expect(citationFillRate(counts)).toBeCloseTo(2 / 3);
  });

  it("returns null fill rate when there are no claims", () => {
    expect(citationFillRate({ totalClaims: 0, citedClaims: 0 })).toBeNull();
  });
});

describe("dead-link rate scorer", () => {
  it("computes dead / total from citation statuses", () => {
    const citations = earlyStageFixture.sections[0].citations;
    expect(deadLinkRate(citations)).toBe(0.5);
  });

  it("returns null when there are no citations", () => {
    expect(deadLinkRate([])).toBeNull();
  });

  it("aggregates across sections", () => {
    expect(aggregateDeadLinkRate(earlyStageFixture.sections)).toBeCloseTo(0.25);
  });
});

describe("domain adherence scorer", () => {
  it("matches ycombinator.com/companies path prefix", () => {
    expect(
      urlMatchesAllowlist("https://www.ycombinator.com/companies/resend", [
        "ycombinator.com/companies",
      ])
    ).toBe(true);
  });

  it("does not false-positive when path contains but does not start with /investor", () => {
    expect(
      urlMatchesAllowlist("https://example.com/not-investor/page", ["/investor"])
    ).toBe(false);
    expect(
      urlMatchesAllowlist("https://example.com/foo/investors", ["/investors"])
    ).toBe(false);
    expect(
      urlMatchesAllowlist("https://example.com/not-careers/page", ["/careers"])
    ).toBe(false);
  });

  it("matches path-prefix entries at segment boundaries", () => {
    expect(
      urlMatchesAllowlist("https://stripe.com/investors/reports", ["/investors"])
    ).toBe(true);
    expect(
      urlMatchesAllowlist("https://resend.com/careers", ["/careers"])
    ).toBe(true);
  });

  it("scores early-stage snapshot citations against allowlist", () => {
    const section = earlyStageFixture.sections[0];
    const rate = domainAdherenceForSection(
      section.sectionKey,
      earlyStageFixture.company.maturity,
      section.citations
    );
    expect(rate).toBe(0.5);
  });

  it("uses tech_stack allowlist for tech_stack section", () => {
    const section = earlyStageFixture.sections[1];
    const rate = domainAdherenceForSection(
      section.sectionKey,
      earlyStageFixture.company.maturity,
      section.citations
    );
    expect(rate).toBe(0.5);
  });

  it("scores enterprise SEC citations", () => {
    expect(aggregateDomainAdherence(enterpriseFixture)).toBe(1);
  });

  it("weights aggregate adherence globally by citation count, not per-section average", () => {
    const adherent = (id: number) => ({
      id,
      url: "https://www.sec.gov/edgar/browse/?CIK=0000000000",
      quote: "filing",
      claim: `claim ${id}`,
      status: "resolved" as const,
    });

    const output = {
      company: enterpriseFixture.company,
      sections: [
        {
          sectionKey: "snapshot",
          content: {},
          citations: [
            {
              id: 0,
              url: "https://example.com/off-allowlist",
              quote: "bad",
              claim: "off list",
              status: "resolved" as const,
            },
          ],
        },
        {
          sectionKey: "funding",
          content: {},
          citations: Array.from({ length: 99 }, (_, i) => adherent(i + 1)),
        },
      ],
    };

    expect(aggregateDomainAdherence(output)).toBeCloseTo(0.99);
  });
});

describe("evalite scorer wrappers", () => {
  it("schemaPassScorer returns 1 for valid anthropic fixture output", async () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "__fixtures__/research-anthropic.json"),
        "utf-8"
      )
    ) as { sections: Record<string, { content: unknown }> };

    const output = {
      company: earlyStageFixture.company,
      sections: SECTIONS.map((section) => ({
        sectionKey: section.key,
        content: fixture.sections[section.key]?.content,
        citations: [],
      })),
    };

    const score = await schemaPassScorer({ input: output.company, output });
    expect(score.score).toBe(1);
  });

  it("computeMetrics returns all four deterministic signals", () => {
    const metrics = computeMetrics(earlyStageFixture);
    expect(metrics.schemaPass).toBeGreaterThan(0);
    expect(metrics.citationFillRate).toBeCloseTo(2 / 3);
    expect(metrics.deadLinkRate).toBeCloseTo(0.25);
    expect(metrics.domainAdherence).toBeCloseTo(0.5);
  });
});

describe("factual-accuracy scorer", () => {
  const source = {
    source: "https://example.com/source",
    asOf: "2026-07-30",
    tier: "primary" as const,
  };

  const output: ResearchEvalOutput = {
    company: {
      name: "Example",
      domain: "example.com",
      maturity: "enterprise",
    },
    sections: [
      {
        sectionKey: "snapshot",
        content: {
          founded_year: 2020,
          hq: "San Francisco, California",
          employee_count_band: "51-200",
        },
        citations: [],
      },
      {
        sectionKey: "funding",
        content: {
          rounds: [
            {
              round_type: "Series A",
              date: "2024-01",
              amount_usd: 10_000_000,
              lead_investors: [],
              all_investors: [],
              valuation_usd: null,
            },
            {
              round_type: "series-b",
              date: "2025-02",
              amount_usd: 52_300_000,
              lead_investors: [],
              all_investors: [],
              valuation_usd: null,
            },
          ],
        },
        citations: [],
      },
    ],
  };

  function groundTruth(facts: ExpectedFacts): GroundTruth {
    return { "example.com": facts };
  }

  it("returns null when the company has no ground-truth entry", () => {
    expect(factualAccuracy(output, {})).toEqual({
      score: null,
      gradedFields: [],
      fieldScores: {},
    });
  });

  it("does not grade expected fields that are absent", () => {
    const result = factualAccuracy(
      output,
      groundTruth({ foundedYear: { value: 2020, ...source } })
    );

    expect(result.score).toBe(1);
    expect(result.gradedFields).toEqual(["foundedYear"]);
    expect(result.fieldScores).toEqual({ foundedYear: true });
  });

  it("uses the required per-field tolerances", () => {
    const result = factualAccuracy(
      output,
      groundTruth({
        foundedYear: { value: 2020, ...source },
        hqCountry: { value: "US", ...source },
        latestFunding: {
          value: {
            stage: "Series B",
            amountUsd: 50_000_000,
            announced: "2025-02-01",
            leadInvestor: null,
          },
          ...source,
        },
        employees: { value: { min: 75, max: 150 }, ...source },
      })
    );

    expect(result).toMatchObject({
      score: 1,
      gradedFields: [
        "foundedYear",
        "hqCountry",
        "latestFunding",
        "employees",
      ],
      fieldScores: {
        foundedYear: true,
        hqCountry: true,
        latestFunding: true,
        employees: true,
      },
    });
  });

  it("normalizes punctuated country aliases inside locations", () => {
    expect(normalizeCountry("Austin, U.S.")).toBe("US");
    expect(normalizeCountry("London, U.K.")).toBe("GB");
  });

  it("requires an exact year and rejects funding outside ten percent", () => {
    const result = factualAccuracy(
      output,
      groundTruth({
        foundedYear: { value: 2021, ...source },
        latestFunding: {
          value: {
            stage: "Series B",
            amountUsd: 47_000_000,
            announced: "2025-02-01",
            leadInvestor: null,
          },
          ...source,
        },
      })
    );

    expect(result.score).toBe(0);
    expect(result.fieldScores).toEqual({
      foundedYear: false,
      latestFunding: false,
    });
  });

  it("compares ticker symbols case-insensitively", () => {
    expect(
      tickerMatches(
        { symbol: "nvda", exchange: "NASDAQ" },
        { symbol: "NVDA", exchange: "NASDAQ" }
      )
    ).toBe(true);
  });

  it("excludes null scores from an aggregate", () => {
    expect(aggregateFactualAccuracy([null, 1, 0, null])).toBe(0.5);
    expect(aggregateFactualAccuracy([null, null])).toBeNull();
  });

  it("returns a null Evalite score for an unmeasured company", async () => {
    const score = await factualAccuracyScorer({
      input: output.company,
      output,
    });

    expect(score.score).toBeNull();
  });
});

describe("eval files are excluded from vitest", () => {
  // Asserts the resolved `include` rather than the file's text. The text version
  // failed the moment a comment in vitest.config.ts mentioned the evals
  // directory, which says nothing about whether eval files are collected.
  it("npm test glob does not match evals/**/*.eval.ts", async () => {
    const config = (await import("../vitest.config")).default as {
      test?: { include?: string[] };
    };
    const include = config.test?.include ?? [];

    expect(include).toContain("__tests__/**/*.test.ts");
    expect(
      include.some((pattern) => pattern.includes("eval")),
    ).toBe(false);
  });

  it("registers factual accuracy only in the measured scorer set", () => {
    expect(RESEARCH_QUALITY_SCORERS).not.toContain(factualAccuracyScorer);
    expect(RESEARCH_SCORERS).toContain(factualAccuracyScorer);
  });
});
