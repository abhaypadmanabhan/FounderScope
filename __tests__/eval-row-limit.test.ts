import { describe, expect, it } from "vitest";
import {
  limitEvalRows,
  partitionEvalRowsByGroundTruth,
} from "../evals/limit";

describe("limitEvalRows", () => {
  const rows = ["one", "two", "three"];

  it.each([undefined, "", "   "])(
    "keeps every row when the limit is absent or blank",
    (raw) => {
      expect(limitEvalRows(rows, raw)).toEqual(rows);
    }
  );

  it("accepts a positive safe integer", () => {
    expect(limitEvalRows(rows, " 2 ")).toEqual(["one", "two"]);
  });

  it.each(["0", "-1", "2x", "2.5", "1.0", "9007199254740992"])(
    "rejects invalid limit %s",
    (raw) => {
      expect(() => limitEvalRows(rows, raw)).toThrow(
        `FOUNDER_SCOPE_EVAL_LIMIT must be a positive integer, got "${raw}".`
      );
    }
  );
});

describe("partitionEvalRowsByGroundTruth", () => {
  const rows = [
    { domain: "measured.test" },
    { domain: "ticker-only.test" },
    { domain: "unmeasured.test" },
  ];

  it("separates measured rows so Evalite never receives a null factual score", () => {
    expect(
      partitionEvalRowsByGroundTruth(rows, {
        "measured.test": {
          foundedYear: {
            value: 2020,
            source: "https://measured.test/about",
            asOf: "2026-07-30",
            tier: "primary",
          },
        },
        "ticker-only.test": {
          ticker: {
            value: { symbol: "TEST", exchange: "NYSE" },
            source: "https://ticker-only.test/filing",
            asOf: "2026-07-30",
            tier: "primary",
          },
        },
      })
    ).toEqual({
      measured: [{ domain: "measured.test" }],
      unmeasured: [
        { domain: "ticker-only.test" },
        { domain: "unmeasured.test" },
      ],
    });
  });
});
