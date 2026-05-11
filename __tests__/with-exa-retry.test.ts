// withExaRetry — retries only on `EXA 429`. Other errors throw on first
// failure. Tests inject zero-delay sleep + zero-ms delays to keep them fast.
import { describe, it, expect, vi } from "vitest";
import { withExaRetry, isExaRateLimitError } from "@/lib/llm/tools/with-exa-retry";

const fastOpts = { sleep: async () => undefined, delays: [0, 0, 0] };

describe("withExaRetry", () => {
  it("retries once on 429 and resolves with the second attempt", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error("EXA 429: too many requests");
      return { ok: true, attempts };
    });
    const out = await withExaRetry(fn, fastOpts);
    expect(out).toEqual({ ok: true, attempts: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all retries on persistent 429", async () => {
    const fn = vi.fn(async () => {
      throw new Error("EXA 429: still rate-limited");
    });
    await expect(withExaRetry(fn, fastOpts)).rejects.toThrow(/EXA 429/);
    // 1 initial attempt + 3 retries
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry on EXA 500 / 503 (5xx surface to caller)", async () => {
    const fn500 = vi.fn(async () => {
      throw new Error("EXA 500: server error");
    });
    await expect(withExaRetry(fn500, fastOpts)).rejects.toThrow(/EXA 500/);
    expect(fn500).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on non-EXA errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(withExaRetry(fn, fastOpts)).rejects.toThrow(/ECONNRESET/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isExaRateLimitError", () => {
  it("detects EXA 429 messages", () => {
    expect(isExaRateLimitError(new Error("EXA 429: too many requests"))).toBe(true);
  });
  it("rejects other EXA errors", () => {
    expect(isExaRateLimitError(new Error("EXA 500: server error"))).toBe(false);
  });
  it("rejects unrelated errors", () => {
    expect(isExaRateLimitError(new Error("network error"))).toBe(false);
  });
});
