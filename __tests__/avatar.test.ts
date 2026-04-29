import { describe, expect, it } from "vitest";
import { avatarToneIndex, initialsOf } from "@/lib/sections/founders-view";

describe("initialsOf", () => {
  it("returns first+last initial for multi-word names", () => {
    expect(initialsOf("Dario Amodei")).toBe("DA");
    expect(initialsOf("Daniela Amodei")).toBe("DA");
    expect(initialsOf("Sam Altman")).toBe("SA");
  });

  it("uses first two chars for single-word names", () => {
    expect(initialsOf("Cher")).toBe("CH");
  });

  it("returns ? for empty input", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });

  it("trims and ignores extra whitespace", () => {
    expect(initialsOf("  Dario   Amodei  ")).toBe("DA");
  });
});

describe("avatarToneIndex", () => {
  it("returns a stable tone in 0..4 for a given name", () => {
    const a = avatarToneIndex("Dario Amodei");
    const b = avatarToneIndex("Dario Amodei");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(4);
  });

  it("distinguishes founders sharing initials (Dario vs Daniela Amodei)", () => {
    // The whole reason this hash exists: avoid identical avatars when
    // siblings/co-founders share initials.
    expect(avatarToneIndex("Dario Amodei")).not.toBe(
      avatarToneIndex("Daniela Amodei"),
    );
  });

  it("distributes across all 5 tones for a representative founder set", () => {
    const sample = [
      "Dario Amodei",
      "Daniela Amodei",
      "Sam Altman",
      "Greg Brockman",
      "Demis Hassabis",
      "Mira Murati",
      "Ilya Sutskever",
      "Jared Kaplan",
      "Tom Brown",
      "Chris Olah",
      "Jack Clark",
      "Patrick Collison",
    ];
    const seen = new Set(sample.map(avatarToneIndex));
    expect(seen.size).toBe(5);
  });

  it("handles edge cases without throwing", () => {
    expect(avatarToneIndex("")).toBe(0);
    expect(avatarToneIndex("X")).toBeGreaterThanOrEqual(0);
  });
});
