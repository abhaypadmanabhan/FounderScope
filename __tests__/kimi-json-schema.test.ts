// Smoke test: every section's outputSchema must produce a JSON Schema with
// type=object. MFJS strict mode rejects non-object roots, so this catches
// regressions before they hit Moonshot.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SECTIONS } from "@/lib/sections/registry";
import { DisambiguationSchema } from "@/lib/disambiguate";

describe("Kimi json_schema generation", () => {
  for (const section of SECTIONS) {
    it(`${section.key} → object root`, () => {
      const schema = z.toJSONSchema(section.outputSchema) as {
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(Object.keys(schema.properties!).length).toBeGreaterThan(0);
    });
  }

  it("disambiguate → object root", () => {
    const schema = z.toJSONSchema(DisambiguationSchema) as {
      type?: string;
      properties?: Record<string, unknown>;
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
  });
});
