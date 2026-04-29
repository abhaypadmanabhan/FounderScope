import { describe, expect, it } from "vitest";
import { confidenceDotStyles } from "@/components/confidence-dot";

describe("confidenceDotStyles", () => {
  it("full variant = solid accent fill + solid accent border", () => {
    const s = confidenceDotStyles("full");
    expect(s.background).toBe("var(--accent-color)");
    expect(s.border).toBe("1.5px solid var(--accent-color)");
  });

  it("partial variant = elevated bg + solid accent border", () => {
    const s = confidenceDotStyles("partial");
    expect(s.background).toBe("var(--bg-elevated)");
    expect(s.border).toBe("1.5px solid var(--accent-color)");
  });

  it("empty variant = transparent fill + dashed accent border", () => {
    const s = confidenceDotStyles("empty");
    expect(s.background).toBe("transparent");
    expect(s.border).toBe("1.5px dashed var(--accent-color)");
  });
});
