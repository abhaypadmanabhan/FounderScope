import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEARCH_BUDGET,
  createSearchBudget,
  createSearchUsage,
  exaCompanyLogo,
  findCompanyLogo,
} from "@/lib/search";

vi.mock("@/lib/search/cache", () => ({
  cacheKeyFor: (_input: unknown, provider: string) => `${provider}-key`,
  readSearchCache: async () => null,
  writeSearchCache: async () => undefined,
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("exaCompanyLogo", () => {
  it("prefers the first image link and preserves the legacy request shape", async () => {
    let request: RequestInit | undefined;
    global.fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        request = init;
        return new Response(
          JSON.stringify({
            results: [
              {
                favicon: "https://acme.example/favicon.ico",
                extras: {
                  imageLinks: ["https://acme.example/wordmark.png"],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const logo = await exaCompanyLogo(
      { name: "Acme", domain: "acme.example" },
      "exa-test",
    );

    expect(logo).toBe("https://acme.example/wordmark.png");
    expect(JSON.parse(String(request?.body))).toEqual({
      query: "Acme official site",
      type: "auto",
      numResults: 1,
      contents: { extras: { imageLinks: 1 } },
      includeDomains: ["acme.example"],
    });
  });

  it("falls back to favicon and returns null on any failure", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [{ favicon: "https://acme.example/favicon.ico" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      exaCompanyLogo({ name: "Acme", domain: null }, "exa-test"),
    ).resolves.toBe("https://acme.example/favicon.ico");

    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      exaCompanyLogo({ name: "Acme", domain: null }, "exa-test"),
    ).resolves.toBeNull();
    await expect(
      exaCompanyLogo({ name: "Acme", domain: null }, ""),
    ).resolves.toBeNull();
  });
});

describe("findCompanyLogo", () => {
  it("derives a favicon for a non-EXA provider without spending a search", async () => {
    // The whole point of the non-EXA path: the domain is already known, so a
    // favicon needs no network call at all. An earlier implementation searched
    // "<name> official site logo" restricted to this very domain, then took its
    // favicon — one paid search, usually two after the thin-result fallback, to
    // recover an argument it was handed.
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchSpy;

    const budget = createSearchBudget("default");
    const usage = createSearchUsage();
    const logo = await findCompanyLogo(
      { name: "Acme", domain: "www.Acme.example" },
      { budget, usage },
    );

    expect(logo).toBe("https://acme.example/favicon.ico");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(budget.used).toBe(0);
    expect(usage.calls).toBe(0);
  });

  it("returns null for a non-EXA provider with no domain, rather than searching", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchSpy;

    const logo = await findCompanyLogo({ name: "Ghost", domain: null }, {});

    expect(logo).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses EXA's real logo image when EXA is configured, and accounts for the call", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              favicon: "https://acme.example/favicon.ico",
              extras: { imageLinks: ["https://cdn.acme.example/logo.png"] },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const budget = createSearchBudget("default");
    const usage = createSearchUsage();
    const logo = await findCompanyLogo(
      { name: "Acme", domain: "acme.example" },
      { exaApiKey: "exa-test", budget, usage },
    );

    // imageLinks beats the favicon — that real image is what routing the logo
    // through the generic SearchProvider interface would have thrown away.
    expect(logo).toBe("https://cdn.acme.example/logo.png");
    expect(budget.used).toBe(1);
    expect(usage.calls).toBe(1);
  });

  it("falls through to the favicon when EXA yields nothing", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const logo = await findCompanyLogo(
      { name: "Acme", domain: "acme.example" },
      { exaApiKey: "exa-test" },
    );

    expect(logo).toBe("https://acme.example/favicon.ico");
  });

  it("still yields a favicon when the search budget is exhausted", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchSpy;

    const budget = createSearchBudget("default");
    budget.used = SEARCH_BUDGET[budget.tier];

    const logo = await findCompanyLogo(
      { name: "Acme", domain: "acme.example" },
      { exaApiKey: "exa-test", budget },
    );

    expect(logo).toBe("https://acme.example/favicon.ico");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});


describe("faviconFor host validation", () => {
  // `domain` reaches here from the request body, which only requires
  // z.string(), and the result is stored in the shared companies.logo_url
  // column and rendered as an <img src> for other users. Anything that is not a
  // bare hostname must not become a URL authority.
  const rejected = [
    "beacon.attacker.tld?id=fs",
    "beacon.attacker.tld#",
    "user@beacon.attacker.tld",
    "beacon.attacker.tld:8080",
    "10.0.0.5",
    "localhost",
    // `.localhost` resolves to loopback in browsers — a stored logo pointing at
    // it is a GET against the viewer's own machine, not the company's server.
    "beacon.localhost",
    "evil.tld/path",
    "has space.tld",
    "-leading-hyphen.tld",
    "",
    `${"a".repeat(250)}.example.com`,
  ];

  it.each(rejected)("refuses to build a URL from %j", async (domain) => {
    const logo = await findCompanyLogo({ name: "Acme", domain }, {});
    expect(logo).toBeNull();
  });

  it("accepts a plain hostname and strips www.", async () => {
    await expect(
      findCompanyLogo({ name: "Acme", domain: "www.Acme.example" }, {}),
    ).resolves.toBe("https://acme.example/favicon.ico");
  });
});
