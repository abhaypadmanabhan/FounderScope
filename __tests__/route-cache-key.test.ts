// Asserts that route.ts plumbs section.cacheKey + disambiguate cacheKey
// through to runResearchCall.
import { describe, it, expect, vi, beforeEach } from "vitest";

const runCalls: Array<{ cacheKey?: string; promptHasCanonical: boolean }> = [];

vi.mock("@/lib/companies", () => ({
  findOrCreateCompany: vi.fn(async () => ({
    id: "co-1",
    slug: "stripe",
    display_name: "Stripe",
    domain: null,
    logo_url: null,
    last_refreshed_at: null,
  })),
  touchLastRefreshed: vi.fn(async () => undefined),
  updateCompanyCanonical: vi.fn(async () => undefined),
  getCompanyBySlug: vi.fn(async () => null),
}));

vi.mock("@/lib/cache", () => ({
  getCachedSection: vi.fn(async () => null),
  upsertCachedSection: vi.fn(async () => undefined),
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...original,
    runResearchCall: vi.fn(async (args: { cacheKey?: string; prompt: string; schema: { parse: (x: unknown) => unknown } }) => {
      runCalls.push({
        cacheKey: args.cacheKey,
        promptHasCanonical: args.prompt.includes("canonical_name"),
      });
      // Return a payload that satisfies disambiguate; for sections we deliberately
      // pass an empty object so schema.parse rejects and route.ts emits
      // section_failed — we only care about cacheKey threading anyway.
      if (args.prompt.includes("canonical_name")) {
        return {
          data: args.schema.parse({
            canonical_name: "Stripe",
            canonical_domain: "stripe.com",
            one_line_description: "Payments infrastructure for the internet.",
            disambiguation_note: null,
          }),
          raw: "{}",
          modelVersion: "claude-haiku-4-5",
        };
      }
      try {
        return {
          data: args.schema.parse({}),
          raw: "{}",
          modelVersion: "claude-haiku-4-5",
        };
      } catch {
        // Throw a researchy error so route.ts logs section_failed and continues.
        throw new Error("schema rejected (intentional)");
      }
    }),
  };
});

beforeEach(() => {
  runCalls.length = 0;
  global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
});

import { POST } from "@/app/api/research/route";

describe("/api/research cacheKey threading", () => {
  it("passes founderscope:disambiguate for the disambig call and founderscope:section:<key> for each section", async () => {
    const req = new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": "sk-test" },
      body: JSON.stringify({ name: "Stripe", domain: null }),
    });
    const res = await POST(req);
    // Drain the SSE stream so the route's async work finishes.
    const reader = res.body!.getReader();
    while (!(await reader.read()).done) {
      // discard
    }

    const disambig = runCalls.find((c) => c.promptHasCanonical);
    expect(disambig?.cacheKey).toBe("founderscope:disambiguate");

    const sectionKeys = [
      "snapshot",
      "moat",
      "founders",
      "tech_stack",
      "funding",
      "traction",
      "market",
    ];
    const seen = new Set(runCalls.map((c) => c.cacheKey));
    for (const key of sectionKeys) {
      expect(seen.has(`founderscope:section:${key}`)).toBe(true);
    }
  });
});
