import { GROUND_TRUTH } from "../ground-truth";
import type {
  EmployeeBand,
  ExpectedFacts,
  FactualAccuracyResult,
  FundingFact,
  GroundTruth,
  ResearchEvalOutput,
  TickerFact,
} from "../types";

interface SnapshotFacts {
  foundedYear?: number;
  hq?: string;
  employees?: EmployeeBand;
}

interface ObservedFunding {
  stage: string;
  amountUsd: number | null;
}

interface ObservedFacts extends SnapshotFacts {
  latestFunding?: ObservedFunding;
  ticker?: TickerFact;
}

interface FundingRoundRecord {
  roundType: string;
  date: string;
  amountUsd: number | null;
}

const EMPLOYEE_BANDS: Record<string, EmployeeBand> = {
  "1-10": { min: 1, max: 10 },
  "11-50": { min: 11, max: 50 },
  "51-200": { min: 51, max: 200 },
  "201-500": { min: 201, max: 500 },
  "501-1000": { min: 501, max: 1_000 },
  "1001-5000": { min: 1_001, max: 5_000 },
  "5001-10000": { min: 5_001, max: 10_000 },
  "10000+": { min: 10_000, max: null },
};

const COUNTRY_ALIASES: Record<string, string> = {
  "U.S.": "US",
  "U.S.A.": "US",
  USA: "US",
  "UNITED STATES OF AMERICA": "US",
  UK: "GB",
  "U.K.": "GB",
  "GREAT BRITAIN": "GB",
};

const US_STATE_NAMES = new Set([
  "ALABAMA",
  "ALASKA",
  "ARIZONA",
  "ARKANSAS",
  "CALIFORNIA",
  "COLORADO",
  "CONNECTICUT",
  "DELAWARE",
  "FLORIDA",
  "GEORGIA",
  "HAWAII",
  "IDAHO",
  "ILLINOIS",
  "INDIANA",
  "IOWA",
  "KANSAS",
  "KENTUCKY",
  "LOUISIANA",
  "MAINE",
  "MARYLAND",
  "MASSACHUSETTS",
  "MICHIGAN",
  "MINNESOTA",
  "MISSISSIPPI",
  "MISSOURI",
  "MONTANA",
  "NEBRASKA",
  "NEVADA",
  "NEW HAMPSHIRE",
  "NEW JERSEY",
  "NEW MEXICO",
  "NEW YORK",
  "NORTH CAROLINA",
  "NORTH DAKOTA",
  "OHIO",
  "OKLAHOMA",
  "OREGON",
  "PENNSYLVANIA",
  "RHODE ISLAND",
  "SOUTH CAROLINA",
  "SOUTH DAKOTA",
  "TENNESSEE",
  "TEXAS",
  "UTAH",
  "VERMONT",
  "VIRGINIA",
  "WASHINGTON",
  "WEST VIRGINIA",
  "WISCONSIN",
  "WYOMING",
  "DISTRICT OF COLUMBIA",
]);

const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

let countryNames: Map<string, string> | null = null;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function sectionContent(
  output: ResearchEvalOutput,
  sectionKey: string
): Record<string, unknown> | null {
  return record(output.sections.find((section) => section.sectionKey === sectionKey)?.content);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableNumber(value: unknown): number | null | undefined {
  return value === null || typeof value === "number" ? value : undefined;
}

function employeeBand(value: unknown): EmployeeBand | undefined {
  const key = stringValue(value);
  return key ? EMPLOYEE_BANDS[key] : undefined;
}

function latestFunding(content: Record<string, unknown> | null): ObservedFunding | undefined {
  if (!content || !Array.isArray(content.rounds)) return undefined;

  const rounds = content.rounds.flatMap((value): FundingRoundRecord[] => {
    const candidate = record(value);
    if (!candidate) return [];
    const roundType = stringValue(candidate.round_type);
    const date = stringValue(candidate.date);
    const amountUsd = nullableNumber(candidate.amount_usd);
    if (!roundType || !date || amountUsd === undefined) return [];
    return [{ roundType, date, amountUsd }];
  });
  const latest = rounds.sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest
    ? { stage: latest.roundType, amountUsd: latest.amountUsd }
    : undefined;
}

function extractObservedFacts(output: ResearchEvalOutput): ObservedFacts {
  const snapshot = sectionContent(output, "snapshot");
  const foundedYear =
    typeof snapshot?.founded_year === "number"
      ? snapshot.founded_year
      : undefined;
  const hq = stringValue(snapshot?.hq);
  const employees = employeeBand(snapshot?.employee_count_band);

  return {
    foundedYear,
    hq,
    employees,
    latestFunding: latestFunding(sectionContent(output, "funding")),
  };
}

function normalizedWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim();
}

const NORMALIZED_COUNTRY_ALIASES = Object.fromEntries(
  Object.entries(COUNTRY_ALIASES).map(([alias, code]) => [
    normalizedWords(alias),
    code,
  ])
);

function isoCountryNames(): Map<string, string> {
  if (countryNames) return countryNames;

  const names = new Map<string, string>();
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second);
      const displayName = displayNames.of(code);
      if (displayName && displayName !== code) {
        names.set(normalizedWords(displayName), code);
      }
    }
  }
  countryNames = names;
  return names;
}

export function normalizeCountry(value: string): string | null {
  const trimmed = value.trim();
  const possibleCode = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(possibleCode)) {
    const displayName = new Intl.DisplayNames(["en"], { type: "region" }).of(
      possibleCode
    );
    if (displayName && displayName !== possibleCode) return possibleCode;
  }
  const directAlias = NORMALIZED_COUNTRY_ALIASES[normalizedWords(trimmed)];
  if (directAlias) return directAlias;

  const normalized = normalizedWords(trimmed);
  const exactCountry = isoCountryNames().get(normalized);
  if (exactCountry) return exactCountry;

  const segments = trimmed
    .split(",")
    .map((segment) => normalizedWords(segment))
    .filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    const alias = NORMALIZED_COUNTRY_ALIASES[segment];
    if (alias) return alias;
    if (US_STATE_NAMES.has(segment) || US_STATE_CODES.has(segment)) return "US";
    const country = isoCountryNames().get(segment);
    if (country) return country;
  }

  return null;
}

export function normalizeFundingStage(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function fundingMatches(
  observed: ObservedFunding | undefined,
  expected: FundingFact
): boolean {
  if (!observed) return false;
  if (normalizeFundingStage(observed.stage) !== normalizeFundingStage(expected.stage)) {
    return false;
  }
  if (expected.amountUsd === null) return observed.amountUsd === null;
  if (observed.amountUsd === null) return false;
  return Math.abs(observed.amountUsd - expected.amountUsd) <= expected.amountUsd * 0.1;
}

export function employeeBandContains(
  observed: EmployeeBand | undefined,
  expected: EmployeeBand
): boolean {
  if (!observed || observed.min > expected.min) return false;
  if (expected.max === null) return observed.max === null;
  return observed.max === null || observed.max >= expected.max;
}

export function tickerMatches(
  observed: TickerFact | undefined,
  expected: TickerFact
): boolean {
  return observed?.symbol.trim().toLowerCase() === expected.symbol.trim().toLowerCase();
}

function gradeExpectedFacts(
  observed: ObservedFacts,
  expected: ExpectedFacts
): FactualAccuracyResult {
  const gradedFields: Array<keyof ExpectedFacts> = [];
  const fieldScores: Partial<Record<keyof ExpectedFacts, boolean>> = {};
  const grade = (field: keyof ExpectedFacts, matches: boolean) => {
    gradedFields.push(field);
    fieldScores[field] = matches;
  };

  if (expected.foundedYear) {
    grade("foundedYear", observed.foundedYear === expected.foundedYear.value);
  }
  if (expected.hqCountry) {
    grade(
      "hqCountry",
      observed.hq !== undefined &&
        normalizeCountry(observed.hq) === normalizeCountry(expected.hqCountry.value)
    );
  }
  if (expected.latestFunding) {
    grade(
      "latestFunding",
      fundingMatches(observed.latestFunding, expected.latestFunding.value)
    );
  }
  if (expected.employees) {
    grade(
      "employees",
      employeeBandContains(observed.employees, expected.employees.value)
    );
  }
  // `ticker` is deliberately NOT graded. No section schema exposes a ticker, so
  // `observed.ticker` can never be populated and grading it would score a miss
  // for every public company on every run — six permanent failures that describe
  // a missing product field, not an accuracy problem. Under this scorer's own
  // rule an unmeasurable fact is left ungraded rather than counted as wrong, and
  // a guaranteed miss is worse than an omission: it moves the aggregate while
  // telling you nothing. The expected values stay in the ground truth so they
  // are ready the day a section carries a ticker; `tickerMatches` stays with
  // them, tested, for the same reason.

  if (gradedFields.length === 0) {
    return { score: null, gradedFields, fieldScores };
  }
  const matches = Object.values(fieldScores).filter(Boolean).length;
  return { score: matches / gradedFields.length, gradedFields, fieldScores };
}

export function factualAccuracy(
  output: ResearchEvalOutput,
  groundTruth: GroundTruth = GROUND_TRUTH
): FactualAccuracyResult {
  const expected = groundTruth[output.company.domain];
  if (!expected) {
    return { score: null, gradedFields: [], fieldScores: {} };
  }
  return gradeExpectedFacts(extractObservedFacts(output), expected);
}

export function aggregateFactualAccuracy(
  scores: Array<number | null>
): number | null {
  const measured = scores.filter((score): score is number => score !== null);
  if (measured.length === 0) return null;
  return measured.reduce((sum, score) => sum + score, 0) / measured.length;
}

export async function factualAccuracyScorer({
  output,
}: {
  input: unknown;
  output: unknown;
  expected?: unknown;
}) {
  const result = factualAccuracy(output as ResearchEvalOutput);
  return {
    name: "factual-accuracy",
    description: "Accuracy of source-backed expected facts; absent facts are ungraded",
    score: result.score,
    metadata: {
      gradedFields: result.gradedFields,
      fieldScores: result.fieldScores,
    },
  };
}
