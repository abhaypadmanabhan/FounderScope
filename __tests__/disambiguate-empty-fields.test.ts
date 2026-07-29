// The first live run returned canonical_domain:"" and one_line_description:""
// for Linear. Those two fields are interpolated into all seven section prompts,
// so blanks there degrade the whole report. Two distinct paths can produce
// them: the catch-and-fall-back path, and a model that answers with empty
// strings — `z.string()` accepts "" without complaint.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let runImpl: () => Promise<{ data: unknown }>;

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    runResearchCall: () => runImpl(),
  };
});

import {
  DisambiguationSchema,
  disambiguateCompany,
  normalizeDisambiguation,
} from "@/lib/disambiguate";

const config = {
  openrouterKey: "sk-or-v1-test",
  searchKey: "exa-test",
  searchProvider: "exa" as const,
};

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("normalizeDisambiguation", () => {
  it("fills an empty canonical_name and domain from the user's input", () => {
    const out = normalizeDisambiguation(
      {
        canonical_name: "",
        canonical_domain: "",
        one_line_description: "",
        disambiguation_note: null,
      },
      "Linear",
      "linear.app",
    );

    expect(out.canonical_name).toBe("Linear");
    expect(out.canonical_domain).toBe("linear.app");
  });

  it("keeps every field the model did get right", () => {
    const out = normalizeDisambiguation(
      {
        canonical_name: "Linear Orbit, Inc.",
        canonical_domain: "linear.app",
        one_line_description: "Issue tracking for software teams.",
        disambiguation_note: "Not Linear Labs.",
      },
      "Linear",
      null,
    );

    expect(out).toEqual({
      canonical_name: "Linear Orbit, Inc.",
      canonical_domain: "linear.app",
      one_line_description: "Issue tracking for software teams.",
      disambiguation_note: "Not Linear Labs.",
    });
  });

  it("does not invent a description it cannot know, but does say so", () => {
    const out = normalizeDisambiguation(
      {
        canonical_name: "Linear",
        canonical_domain: "linear.app",
        one_line_description: "   ",
        disambiguation_note: null,
      },
      "Linear",
      null,
    );

    expect(out.one_line_description).toBe("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("one_line_description"),
    );
  });

  it("normalises a whitespace-only note to null", () => {
    const out = normalizeDisambiguation(
      {
        canonical_name: "Linear",
        canonical_domain: "linear.app",
        one_line_description: "Issue tracking.",
        disambiguation_note: "  ",
      },
      "Linear",
      null,
    );
    expect(out.disambiguation_note).toBeNull();
  });
});

describe("DisambiguationSchema", () => {
  it("trims model output so ' linear.app ' never reaches a prompt", () => {
    const parsed = DisambiguationSchema.parse({
      canonical_name: "  Linear  ",
      canonical_domain: " linear.app ",
      one_line_description: " Issue tracking. ",
      disambiguation_note: null,
    });
    expect(parsed.canonical_name).toBe("Linear");
    expect(parsed.canonical_domain).toBe("linear.app");
  });

  it("still accepts empty strings — that is why normalize exists", () => {
    // Tightening to .min(1) would discard a good name and domain because the
    // description was blank. Recovery beats rejection here.
    expect(
      DisambiguationSchema.safeParse({
        canonical_name: "Linear",
        canonical_domain: "linear.app",
        one_line_description: "",
        disambiguation_note: null,
      }).success,
    ).toBe(true);
  });
});

describe("disambiguateCompany", () => {
  it("normalises a partially blank model answer instead of passing it through", async () => {
    runImpl = async () => ({
      data: {
        canonical_name: "",
        canonical_domain: "",
        one_line_description: "Issue tracking for software teams.",
        disambiguation_note: null,
      },
    });

    const out = await disambiguateCompany({
      config,
      name: "Linear",
      domain: "linear.app",
    });

    expect(out.canonical_name).toBe("Linear");
    expect(out.canonical_domain).toBe("linear.app");
    expect(out.one_line_description).toBe("Issue tracking for software teams.");
  });

  it("falls back to raw input on failure and logs it at error level, not dev-only", async () => {
    runImpl = async () => {
      throw new Error("Step timeout of 60000ms exceeded");
    };

    const out = await disambiguateCompany({
      config,
      name: "Linear",
      domain: null,
    });

    // This is the exact shape the live run produced — now attributable.
    expect(out).toEqual({
      canonical_name: "Linear",
      canonical_domain: "",
      one_line_description: "",
      disambiguation_note: null,
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("falling back to raw input"),
      expect.stringContaining("Step timeout"),
    );
  });
});
