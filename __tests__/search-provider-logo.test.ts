import { afterEach, describe, expect, it, vi } from "vitest";
import { exaCompanyLogo } from "@/lib/search";

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
