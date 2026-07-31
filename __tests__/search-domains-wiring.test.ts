import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const readCacheMock = vi.fn<(key: string) => Promise<unknown>>();
const writeCacheMock = vi.fn<
  (
    key: string,
    query: string,
    results: unknown,
    ttlDays?: number,
  ) => Promise<void>
>(async () => undefined);

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: () => "cache-key",
  readSearchCache: (key: string) => readCacheMock(key),
  writeSearchCache: (
    key: string,
    query: string,
    results: unknown,
    ttlDays?: number,
  ) => writeCacheMock(key, query, results, ttlDays),
}));

const capturedRequests: import("@/lib/search/request").SearchRequest[] = [];

vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  const { withSearchPolicy } = await import("@/lib/search/policy");
  const backend = {
    id: "exa" as const,
    search: async (_query: string, request: import("@/lib/search/request").SearchRequest) => {
      capturedRequests.push(request);
      return [
        { title: "a", url: "https://a.example", highlights: [] },
        { title: "b", url: "https://b.example", highlights: [] },
        { title: "c", url: "https://c.example", highlights: [] },
      ];
    },
  };
  return {
    ...actual,
    createSearchProvider: () => withSearchPolicy(backend),
  };
});

import { SECTIONS } from "@/lib/sections/registry";
import {
  DisambiguationSchema,
  normalizeDisambiguation,
} from "@/lib/disambiguate";
import { runResearchCall } from "@/lib/llm";
import {
  allowlistForSection,
  DEFAULT_MATURITY,
  EARLY_STAGE_DOMAINS,
  ENTERPRISE_DOMAINS,
  isLegalIncludeDomain,
  TECH_STACK_DOMAINS,
} from "@/lib/search/domains";
import { withSearchPolicy } from "@/lib/search/policy";
import type { SearchRequest } from "@/lib/search/request";
import {
  FALLBACK_DOMAINS,
  sourceFallback,
} from "@/lib/search/source-fallback";
import { createSearchBudget, createSearchUsage } from "@/lib/search";
import type { RawSearchProvider } from "@/lib/search/types";

type ToolLike = {
  execute: (args: unknown) => Promise<string>;
};

const generateTextCalls: Array<Record<string, unknown>> = [];
let generateTextImpl: (params: Record<string, unknown>) => Promise<unknown>;

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: async (params: Record<string, unknown>) => {
      generateTextCalls.push(params);
      return generateTextImpl(params);
    },
  };
});

const schema = z.object({ summary: z.string() });
const config = {
  openrouterKey: "sk-or-v1-test",
  searchKey: "exa-test",
  searchProvider: "exa" as const,
};

function toolFrom(params: Record<string, unknown>): ToolLike {
  const tools = params.tools as Record<string, ToolLike>;
  return tools.web_search;
}

const okResult = {
  output: { summary: "ok" },
  text: '{"summary":"ok"}',
  steps: [{ text: '{"summary":"ok"}' }],
  finishReason: "stop",
  response: { modelId: "m" },
};

beforeEach(() => {
  readCacheMock.mockReset();
  readCacheMock.mockResolvedValue(null);
  writeCacheMock.mockClear();
  capturedRequests.length = 0;
  generateTextCalls.length = 0;
  generateTextImpl = async () => okResult;
});

describe("allowlistForSection", () => {
  it("covers every section key in the registry", () => {
    for (const section of SECTIONS) {
      const allowlist = allowlistForSection(
        section.key,
        "early-stage",
        "acme.com",
      );
      expect(allowlist.length).toBeGreaterThan(0);
    }
  });

  it("uses tech-stack base domains regardless of maturity", () => {
    expect(allowlistForSection("tech_stack", "early-stage")).toEqual(
      TECH_STACK_DOMAINS,
    );
    expect(allowlistForSection("tech_stack", "enterprise")).toEqual(
      TECH_STACK_DOMAINS,
    );
  });

  it("appends company careers paths and wildcard for tech_stack when domain is known", () => {
    expect(allowlistForSection("tech_stack", "early-stage", "stripe.com")).toEqual([
      ...TECH_STACK_DOMAINS,
      "stripe.com/careers",
      "*.stripe.com",
    ]);
  });

  it("splits non-tech sections by maturity", () => {
    expect(allowlistForSection("funding", "early-stage")).toEqual(
      EARLY_STAGE_DOMAINS,
    );
    expect(allowlistForSection("funding", "enterprise")).toEqual(
      ENTERPRISE_DOMAINS,
    );
  });

  it("appends company IR paths and wildcard for enterprise sections when domain is known", () => {
    expect(allowlistForSection("funding", "enterprise", "stripe.com")).toEqual([
      ...ENTERPRISE_DOMAINS,
      "stripe.com/investors",
      "stripe.com/investor",
      "*.stripe.com",
    ]);
  });

  // canonical_domain is produced by an LLM told to omit protocol/path/www. That
  // is a request, not a guarantee, and a raw value interpolates into filters EXA
  // rejects — `*.https://stripe.com`, `stripe.com/investors/investors`.
  it.each([
    "https://stripe.com",
    "http://stripe.com",
    "https://www.stripe.com",
    "stripe.com/investors",
    "https://stripe.com/investors?utm=x",
    "https://stripe.com:8443/path?q=1",
    "  HTTPS://Stripe.com/  ",
  ])("reduces %j to the bare hostname", (canonicalDomain) => {
    expect(allowlistForSection("funding", "enterprise", canonicalDomain)).toEqual([
      ...ENTERPRISE_DOMAINS,
      "stripe.com/investors",
      "stripe.com/investor",
      "*.stripe.com",
    ]);
  });

  it.each([
    "mailto:john@example.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "user:pass@example.com",
    "10.0.0.5",
    "localhost",
    "[::1]",
    "not a domain",
    "/investors",
    "   ",
  ])("drops unusable canonical domain %j rather than interpolating it", (
    canonicalDomain,
  ) => {
    expect(allowlistForSection("funding", "enterprise", canonicalDomain)).toEqual(
      ENTERPRISE_DOMAINS,
    );
  });

  it("produces only EXA-legal includeDomains for every section, maturity, and domain", () => {
    const domains = [
      "stripe.com",
      "acme.io",
      "https://stripe.com",
      "stripe.com/investors",
      "mailto:john@example.com",
      "10.0.0.5",
      "not a domain",
      null,
    ] as const;
    const maturities = ["early-stage", "enterprise"] as const;
    for (const section of SECTIONS) {
      for (const maturity of maturities) {
        for (const domain of domains) {
          for (const entry of allowlistForSection(
            section.key,
            maturity,
            domain,
          )) {
            expect(
              isLegalIncludeDomain(entry),
              `illegal includeDomains entry "${entry}" for ${section.key}/${maturity}/${domain}`,
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe("sourceFallback", () => {
  it("drops includeDomains when the primary request already carried an allowlist", () => {
    const original: SearchRequest = {
      query: "acme funding",
      numResults: 5,
      includeDomains: [...EARLY_STAGE_DOMAINS],
    };
    expect(sourceFallback(original)).toEqual({
      query: "acme funding",
      numResults: 5,
    });
    expect(sourceFallback(original).includeDomains).toBeUndefined();
  });

  it("keeps FALLBACK_DOMAINS when the primary request had no includeDomains", () => {
    const original: SearchRequest = { query: "stealth startup" };
    expect(sourceFallback(original).includeDomains).toEqual([
      ...FALLBACK_DOMAINS,
    ]);
  });
});

describe("includeDomains reach the provider SearchRequest", () => {
  it("forwards section allowlists through runResearchCall into the backend request", async () => {
    const includeDomains = [...allowlistForSection("funding", "early-stage")];
    generateTextImpl = async (params) => {
      await toolFrom(params).execute({ query: "acme funding round" });
      return okResult;
    };

    await runResearchCall({
      config,
      tier: "default",
      prompt: "p",
      schema,
      includeDomains,
    });

    expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
    expect(capturedRequests[0].includeDomains).toEqual(includeDomains);
  });

  it("drops allowlists on thin-result retry instead of swapping FALLBACK_DOMAINS", async () => {
    const captured: SearchRequest[] = [];
    const backend: RawSearchProvider = {
      id: "exa",
      search: async (_query, request) => {
        captured.push(request);
        // Empty, not merely sparse: a grounded search only widens when it found
        // nothing at all. Two on-allowlist hits are a success for a query that
        // asked for a narrow slice of the web on purpose.
        if (captured.length === 1) return [];
        return [
          { title: "open", url: "https://open.example", highlights: [] },
          { title: "open2", url: "https://open2.example", highlights: [] },
          { title: "open3", url: "https://open3.example", highlights: [] },
        ];
      },
    };

    const provider = withSearchPolicy(backend);
    const includeDomains = [...allowlistForSection("snapshot", "enterprise")];
    await provider.search("stripe revenue", {
      budget: createSearchBudget("default"),
      usage: createSearchUsage(),
      includeDomains,
    });

    expect(captured).toHaveLength(2);
    expect(captured[0].includeDomains).toEqual(includeDomains);
    expect(captured[1].includeDomains).toBeUndefined();
  });

  it("does not buy a second search when a grounded query returns few but non-zero results", async () => {
    // The regression this guards: SOURCE_FALLBACK_THRESHOLD is 3 and EXA returns
    // 5 by default, so once every section carries an allowlist, "fewer than 3"
    // becomes the common case. Widening on 2 results would spend roughly half of
    // each section's cap on near-empty probes and exhaust the budget at half the
    // distinct queries.
    const captured: SearchRequest[] = [];
    const backend: RawSearchProvider = {
      id: "exa",
      search: async (_query, request) => {
        captured.push(request);
        return [
          { title: "a", url: "https://sec.gov/edgar/a", highlights: [] },
          { title: "b", url: "https://sec.gov/edgar/b", highlights: [] },
        ];
      },
    };

    const budget = createSearchBudget("default");
    await withSearchPolicy(backend).search("stripe revenue", {
      budget,
      usage: createSearchUsage(),
      includeDomains: [...allowlistForSection("snapshot", "enterprise")],
    });

    expect(captured).toHaveLength(1);
    expect(budget.used).toBe(1);
  });

  it("still widens an UNGROUNDED thin result to FALLBACK_DOMAINS", async () => {
    const captured: SearchRequest[] = [];
    const backend: RawSearchProvider = {
      id: "exa",
      search: async (_query, request) => {
        captured.push(request);
        return captured.length === 1
          ? [{ title: "sparse", url: "https://sparse.example", highlights: [] }]
          : [{ title: "open", url: "https://open.example", highlights: [] }];
      },
    };

    await withSearchPolicy(backend).search("some company", {
      budget: createSearchBudget("default"),
      usage: createSearchUsage(),
    });

    expect(captured).toHaveLength(2);
    expect(captured[1].includeDomains).toEqual([...FALLBACK_DOMAINS]);
  });

  it("still applies FALLBACK_DOMAINS on thin-result retry when none were set", async () => {
    const captured: SearchRequest[] = [];
    const backend: RawSearchProvider = {
      id: "exa",
      search: async (_query, request) => {
        captured.push(request);
        // Empty, not merely sparse: a grounded search only widens when it found
        // nothing at all. Two on-allowlist hits are a success for a query that
        // asked for a narrow slice of the web on purpose.
        if (captured.length === 1) return [];
        return [
          { title: "fb", url: "https://fb.example", highlights: [] },
          { title: "fb2", url: "https://fb2.example", highlights: [] },
          { title: "fb3", url: "https://fb3.example", highlights: [] },
        ];
      },
    };

    const provider = withSearchPolicy(backend);
    await provider.search("unknown startup", {
      budget: createSearchBudget("default"),
      usage: createSearchUsage(),
    });

    expect(captured).toHaveLength(2);
    expect(captured[0].includeDomains).toBeUndefined();
    expect(captured[1].includeDomains).toEqual([...FALLBACK_DOMAINS]);
  });
});

describe("DisambiguationSchema maturity", () => {
  it("defaults to early-stage when the model omits maturity", () => {
    const parsed = DisambiguationSchema.parse({
      canonical_name: "Acme",
      canonical_domain: "acme.com",
      one_line_description: "Widgets.",
      disambiguation_note: null,
    });
    expect(parsed.maturity).toBe(DEFAULT_MATURITY);
  });

  it("accepts an explicit enterprise label", () => {
    const parsed = DisambiguationSchema.parse({
      canonical_name: "Stripe",
      canonical_domain: "stripe.com",
      one_line_description: "Payments.",
      disambiguation_note: null,
      maturity: "enterprise",
    });
    expect(parsed.maturity).toBe("enterprise");
  });

  it("normalizes missing maturity to the documented default", () => {
    const out = normalizeDisambiguation(
      {
        canonical_name: "Acme",
        canonical_domain: "acme.com",
        one_line_description: "Widgets.",
        disambiguation_note: null,
        maturity: DEFAULT_MATURITY,
      },
      "Acme",
      "acme.com",
    );
    expect(out.maturity).toBe(DEFAULT_MATURITY);
  });
});
