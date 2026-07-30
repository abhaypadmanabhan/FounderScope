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
  schemaPassScorer,
} from "../evals/scorers";
import { scoreSchemaPass, sectionSchemaPasses } from "../evals/scorers/schema-pass";
import {
  earlyStageFixture,
  enterpriseFixture,
} from "../evals/fixtures/scorer-fixtures";
import { SECTIONS } from "@/lib/sections/registry";

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

describe("eval files are excluded from vitest", () => {
  it("npm test glob does not match evals/**/*.eval.ts", () => {
    const configPath = path.resolve(process.cwd(), "vitest.config.ts");
    const configSource = fs.readFileSync(configPath, "utf-8");
    expect(configSource).toContain("__tests__/**/*.test.ts");
    expect(configSource).not.toContain("evals");
  });
});
