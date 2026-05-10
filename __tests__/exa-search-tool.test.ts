import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        results: [
          { title: "A", url: "https://a.example", highlights: ["a-hl"] },
          { title: "B", url: "https://b.example", highlights: ["b-hl"] },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { EXA_SEARCH_TOOL, handleExaSearch, openaiExaToolDef } from "@/lib/llm/tools/exa-search";

describe("EXA_SEARCH_TOOL", () => {
  it("declares the expected schema for the tool-use loop", () => {
    expect(EXA_SEARCH_TOOL.name).toBe("exa_search");
    expect(EXA_SEARCH_TOOL.input_schema.required).toEqual(["query"]);
    expect(EXA_SEARCH_TOOL.input_schema.properties.query.type).toBe("string");
    expect(EXA_SEARCH_TOOL.input_schema.properties.num_results.type).toBe("integer");
  });
});

describe("handleExaSearch", () => {
  it("returns a stringified payload the model can read", async () => {
    const out = await handleExaSearch({ query: "stripe" }, "exa-key");
    const parsed = JSON.parse(out);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toEqual({
      title: "A",
      url: "https://a.example",
      highlights: ["a-hl"],
    });
  });

  it("returns a stringified error on EXA failure rather than throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as any;
    const out = await handleExaSearch({ query: "x" }, "exa-key");
    const parsed = JSON.parse(out);
    expect(parsed.error).toMatch(/EXA 500/);
  });
});

describe("openaiExaToolDef", () => {
  it("emits an OpenAI function-tool definition with strict json schema", () => {
    const def = openaiExaToolDef();
    expect(def.type).toBe("function");
    expect(def.function.name).toBe("exa_search");
    expect(def.function.parameters.type).toBe("object");
    expect(def.function.parameters.required).toEqual(["query"]);
    expect(def.function.parameters.properties.query.type).toBe("string");
    expect(def.function.parameters.properties.num_results.type).toBe("integer");
    // Description carries through so the model gets the same guidance.
    expect(def.function.description).toMatch(/Search the public web/i);
  });
});
