import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { founders } from "@/lib/sections/founders";

describe("founders fixture × outputSchema", () => {
  it("Anthropic fixture parses against current schema", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "__fixtures__/research-anthropic.json"
    );
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const content = raw.sections.founders.content;
    const result = founders.outputSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        "fixture failed schema parse:\n" +
          JSON.stringify(result.error.issues, null, 2)
      );
    }
  });

  it("every founder entry carries every link field as a key (null OK)", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "__fixtures__/research-anthropic.json"
    );
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const parsed = founders.outputSchema.parse(raw.sections.founders.content);
    for (const f of parsed.founders) {
      expect(f).toHaveProperty("photo_url");
      expect(f).toHaveProperty("linkedin_url");
      expect(f).toHaveProperty("twitter_url");
      expect(f).toHaveProperty("personal_site");
      expect(f).toHaveProperty("github_url");
    }
  });
});
