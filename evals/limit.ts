export function limitEvalRows<T>(
  rows: T[],
  rawLimit: string | undefined
): T[] {
  const raw = rawLimit?.trim();
  if (!raw) return rows;

  const limit = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(
      `FOUNDER_SCOPE_EVAL_LIMIT must be a positive integer, got "${raw}".`
    );
  }

  return rows.slice(0, limit);
}

export function partitionEvalRowsByGroundTruth<T extends { domain: string }>(
  rows: T[],
  groundTruth: Record<string, object | undefined>
): { measured: T[]; unmeasured: T[] } {
  const measured: T[] = [];
  const unmeasured: T[] = [];

  for (const row of rows) {
    const expectedFacts = groundTruth[row.domain] as
      | {
          foundedYear?: unknown;
          hqCountry?: unknown;
          latestFunding?: unknown;
          employees?: unknown;
        }
      | undefined;
    const hasMeasurableFact = Boolean(
      expectedFacts?.foundedYear ||
        expectedFacts?.hqCountry ||
        expectedFacts?.latestFunding ||
        expectedFacts?.employees
    );
    const destination =
      hasMeasurableFact ? measured : unmeasured;
    destination.push(row);
  }

  return { measured, unmeasured };
}
