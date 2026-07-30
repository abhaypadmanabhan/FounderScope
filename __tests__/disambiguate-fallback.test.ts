// Disambiguation is an optimization, not a hard requirement. A flaky model JSON
// response must never abort the entire research run — disambiguateCompany must
// fall back to the user's raw input as the canonical identity.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({
  runResearchCall: vi.fn(),
  ResearchError: class ResearchError extends Error {
    category: string;
    constructor(category: string, message: string) {
      super(message);
      this.category = category;
    }
  },
}));

import { runResearchCall } from "@/lib/llm";
import { disambiguateCompany } from "@/lib/disambiguate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config = {} as any;

describe("disambiguateCompany — graceful fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns model result on success", async () => {
    const data = {
      canonical_name: "Bolt Financial Inc.",
      canonical_domain: "bolt.com",
      one_line_description: "Checkout platform.",
      disambiguation_note: null,
      maturity: "early-stage" as const,
    };
    (runResearchCall as ReturnType<typeof vi.fn>).mockResolvedValue({ data });
    const result = await disambiguateCompany({ config, name: "Bolt", domain: "bolt.com" });
    expect(result).toEqual(data);
  });

  it("falls back to raw input when the call throws", async () => {
    (runResearchCall as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("schema_validation: bad shape"),
    );
    const result = await disambiguateCompany({ config, name: "Acme", domain: "acme.io" });
    expect(result).toEqual({
      canonical_name: "Acme",
      canonical_domain: "acme.io",
      one_line_description: "",
      disambiguation_note: null,
      maturity: "early-stage",
    });
  });

  it("falls back with empty domain when none provided", async () => {
    (runResearchCall as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const result = await disambiguateCompany({ config, name: "Acme", domain: null });
    expect(result.canonical_name).toBe("Acme");
    expect(result.canonical_domain).toBe("");
  });
});
