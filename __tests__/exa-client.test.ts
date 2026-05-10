import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  lastRequest = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async (url: any, init: any) => {
    lastRequest = { url: String(url), init };
    return new Response(
      JSON.stringify({
        results: [
          {
            title: "Stripe — payments infra",
            url: "https://stripe.com",
            highlights: ["Stripe builds payments APIs."],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { exaSearch } from "@/lib/llm/tools/exa-client";

describe("exaSearch", () => {
  it("posts to https://api.exa.ai/search with correct shape", async () => {
    await exaSearch({ query: "stripe", numResults: 5 }, "exa-test");
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.url).toBe("https://api.exa.ai/search");
    expect(lastRequest!.init.method).toBe("POST");
    const headers = new Headers(lastRequest!.init.headers as HeadersInit);
    expect(headers.get("x-api-key")).toBe("exa-test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(lastRequest!.init.body as string);
    expect(body.query).toBe("stripe");
    expect(body.type).toBe("auto");
    expect(body.numResults).toBe(5);
    expect(body.contents.highlights).toBe(true);
  });

  it("returns parsed { title, url, highlights } results", async () => {
    const out = await exaSearch({ query: "stripe" }, "exa-test");
    expect(out.results).toHaveLength(1);
    expect(out.results[0].title).toBe("Stripe — payments infra");
    expect(out.results[0].url).toBe("https://stripe.com");
    expect(out.results[0].highlights).toEqual(["Stripe builds payments APIs."]);
  });

  it("defaults numResults to 5 when omitted", async () => {
    await exaSearch({ query: "stripe" }, "exa-test");
    const body = JSON.parse(lastRequest!.init.body as string);
    expect(body.numResults).toBe(5);
  });

  it("throws on non-2xx", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn(async () => new Response("rate limit", { status: 429 })) as any;
    await expect(exaSearch({ query: "x" }, "exa-test")).rejects.toThrow(/EXA 429/);
  });
});
