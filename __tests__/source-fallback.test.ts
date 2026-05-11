// sourceFallback is a pure transform — given a query, return the same query
// with `includeDomains` biased to canonical early-stage sources. No I/O.
import { describe, it, expect } from "vitest";
import {
  sourceFallback,
  FALLBACK_DOMAINS,
  SOURCE_FALLBACK_THRESHOLD,
} from "@/lib/llm/tools/source-fallback";

describe("sourceFallback", () => {
  it("preserves the original query string", () => {
    const out = sourceFallback({ query: "acme inc founders" });
    expect(out.query).toBe("acme inc founders");
  });

  it("adds the canonical early-stage domains via includeDomains", () => {
    const out = sourceFallback({ query: "stealth co" });
    expect(out.includeDomains).toEqual([
      "ycombinator.com",
      "wellfound.com",
      "linkedin.com",
      "github.com",
      "sec.gov",
      "crunchbase.com",
    ]);
  });

  it("preserves other params (numResults) untouched", () => {
    const out = sourceFallback({ query: "x", numResults: 7 });
    expect(out.numResults).toBe(7);
  });

  it("overrides any pre-existing includeDomains (broad fallback wins)", () => {
    const out = sourceFallback({
      query: "x",
      includeDomains: ["example.com"],
    });
    expect(out.includeDomains).toEqual([...FALLBACK_DOMAINS]);
  });

  it("threshold is set to a sane low integer", () => {
    expect(SOURCE_FALLBACK_THRESHOLD).toBeGreaterThan(0);
    expect(SOURCE_FALLBACK_THRESHOLD).toBeLessThanOrEqual(5);
  });
});
