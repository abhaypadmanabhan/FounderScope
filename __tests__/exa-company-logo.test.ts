import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;
let nextResponse: () => Response = () =>
  new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  lastRequest = null;
  nextResponse = () =>
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async (url: any, init: any) => {
    lastRequest = { url: String(url), init };
    return nextResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { exaCompanyLogo } from "@/lib/llm/tools/exa-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("exaCompanyLogo", () => {
  it("returns extras.imageLinks[0] when present", async () => {
    nextResponse = () =>
      jsonResponse({
        results: [
          {
            title: "Stripe",
            url: "https://stripe.com",
            favicon: "https://stripe.com/favicon.ico",
            extras: { imageLinks: ["https://stripe.com/og-image.png"] },
          },
        ],
      });
    const out = await exaCompanyLogo(
      { name: "Stripe", domain: "stripe.com" },
      "exa-test",
    );
    expect(out).toBe("https://stripe.com/og-image.png");
  });

  it("falls back to favicon when imageLinks empty", async () => {
    nextResponse = () =>
      jsonResponse({
        results: [
          {
            title: "Stripe",
            url: "https://stripe.com",
            favicon: "https://stripe.com/favicon.ico",
            extras: { imageLinks: [] },
          },
        ],
      });
    const out = await exaCompanyLogo(
      { name: "Stripe", domain: "stripe.com" },
      "exa-test",
    );
    expect(out).toBe("https://stripe.com/favicon.ico");
  });

  it("returns null when neither imageLinks nor favicon present", async () => {
    nextResponse = () =>
      jsonResponse({
        results: [{ title: "x", url: "https://x.com" }],
      });
    const out = await exaCompanyLogo(
      { name: "X", domain: "x.com" },
      "exa-test",
    );
    expect(out).toBeNull();
  });

  it("returns null on no results", async () => {
    nextResponse = () => jsonResponse({ results: [] });
    const out = await exaCompanyLogo(
      { name: "Nope", domain: null },
      "exa-test",
    );
    expect(out).toBeNull();
  });

  it("returns null (does not throw) on non-2xx", async () => {
    nextResponse = () => new Response("nope", { status: 500 });
    const out = await exaCompanyLogo(
      { name: "Stripe", domain: "stripe.com" },
      "exa-test",
    );
    expect(out).toBeNull();
  });

  it("returns null (does not throw) on network error", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const out = await exaCompanyLogo(
      { name: "Stripe", domain: "stripe.com" },
      "exa-test",
    );
    expect(out).toBeNull();
  });

  it("includes includeDomains when domain is provided", async () => {
    nextResponse = () => jsonResponse({ results: [] });
    await exaCompanyLogo(
      { name: "Stripe", domain: "stripe.com" },
      "exa-test",
    );
    expect(lastRequest).not.toBeNull();
    const body = JSON.parse(lastRequest!.init.body as string);
    expect(body.includeDomains).toEqual(["stripe.com"]);
    expect(body.numResults).toBe(1);
    expect(body.contents?.extras?.imageLinks).toBe(1);
  });

  it("omits includeDomains when domain is null", async () => {
    nextResponse = () => jsonResponse({ results: [] });
    await exaCompanyLogo({ name: "Stripe", domain: null }, "exa-test");
    const body = JSON.parse(lastRequest!.init.body as string);
    expect(body.includeDomains).toBeUndefined();
    expect(body.query).toContain("Stripe");
  });

  it("sends x-api-key header", async () => {
    nextResponse = () => jsonResponse({ results: [] });
    await exaCompanyLogo({ name: "Stripe", domain: null }, "exa-test-key");
    const headers = new Headers(lastRequest!.init.headers as HeadersInit);
    expect(headers.get("x-api-key")).toBe("exa-test-key");
  });
});
