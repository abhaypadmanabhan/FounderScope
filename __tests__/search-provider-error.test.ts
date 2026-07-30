import { describe, expect, it, vi } from "vitest";
import {
  SearchHttpError,
  isSearchRateLimitError,
  withSearchRetry,
} from "@/lib/search";
import { responseError } from "@/lib/search/http";

describe("SearchHttpError", () => {
  it("carries provider and HTTP status as fields", async () => {
    const response = new Response("rate limited", { status: 429 });
    const error = await responseError("FIRECRAWL", response);

    expect(error).toBeInstanceOf(SearchHttpError);
    expect((error as SearchHttpError).provider).toBe("FIRECRAWL");
    expect((error as SearchHttpError).status).toBe(429);
    expect((error as SearchHttpError).responseText).toBe("rate limited");
    expect(error.message).toBe("FIRECRAWL 429: rate limited");
  });
});

describe("isSearchRateLimitError", () => {
  it("reads provider and status fields instead of parsing the message", () => {
    const rateLimit = new SearchHttpError("tavily", 429, "");
    const serverError = new SearchHttpError("tavily", 500, "boom");
    const otherProvider = new SearchHttpError("exa", 429, "");

    expect(isSearchRateLimitError("tavily", rateLimit)).toBe(true);
    expect(isSearchRateLimitError("tavily", serverError)).toBe(false);
    expect(isSearchRateLimitError("tavily", otherProvider)).toBe(false);
  });

  it("keeps legacy message-prefix behaviour for plain Errors", () => {
    expect(
      isSearchRateLimitError("exa", new Error("EXA 429: slow down")),
    ).toBe(true);
    expect(
      isSearchRateLimitError("exa", new Error("EXA 500: oops")),
    ).toBe(false);
  });
});

describe("withSearchRetry", () => {
  it("retries on a matching typed 429 by reading fields, not the message", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        new SearchHttpError("firecrawl", 429, "retry me"),
      )
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn(async () => undefined);

    const result = await withSearchRetry("firecrawl", operation, {
      sleep,
      delays: [1],
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 429 from a different provider", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new SearchHttpError("tavily", 429, "wrong provider"));

    await expect(
      withSearchRetry("firecrawl", operation, { delays: [] }),
    ).rejects.toBeInstanceOf(SearchHttpError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-429 error", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new SearchHttpError("firecrawl", 503, "down"));

    await expect(
      withSearchRetry("firecrawl", operation, { delays: [] }),
    ).rejects.toBeInstanceOf(SearchHttpError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
