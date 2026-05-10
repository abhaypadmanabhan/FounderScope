import { describe, it, expect, expectTypeOf } from "vitest";
import type { RunArgs } from "@/lib/llm/types";
import { CACHE_KEY_PREFIX } from "@/lib/llm/types";

describe("RunArgs.cacheKey", () => {
  it("is an optional string field", () => {
    expectTypeOf<RunArgs<{ ok: boolean }>["cacheKey"]>().toEqualTypeOf<string | undefined>();
  });

  it("CACHE_KEY_PREFIX is the founderscope namespace", () => {
    expect(CACHE_KEY_PREFIX).toBe("founderscope");
  });
});
