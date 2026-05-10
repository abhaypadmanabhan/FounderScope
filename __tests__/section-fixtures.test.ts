import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { SECTIONS } from "@/lib/sections/registry";

interface Fixture {
  sections: Record<string, { content: unknown }>;
}

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), "__fixtures__/research-anthropic.json"),
    "utf-8"
  )
) as Fixture;

describe("section schemas accept the anthropic fixture content", () => {
  for (const section of SECTIONS) {
    it(`${section.key} content parses cleanly`, () => {
      const content = fixture.sections[section.key]?.content;
      expect(content, `fixture missing ${section.key}`).toBeDefined();
      const result = section.outputSchema.safeParse(content);
      if (!result.success) {
        // Surface the validation failure path in the assertion message.
        throw new Error(
          `${section.key} fixture failed schema parse: ${JSON.stringify(
            result.error.issues,
            null,
            2
          )}`
        );
      }
      expect(result.success).toBe(true);
    });
  }
});

describe("each section declares a stable cacheKey", () => {
  for (const section of SECTIONS) {
    it(`${section.key} has cacheKey "founderscope:section:${section.key}"`, () => {
      expect(section.cacheKey).toBe(`founderscope:section:${section.key}`);
    });
  }
});
