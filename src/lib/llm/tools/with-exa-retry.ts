// Retry wrapper for raw `exaSearch` calls. Exa errors surface as
// `Error("EXA <status>: <body>")` (see exa-client.ts:42) — they are NOT
// ResearchError, so the project-wide `withRetry` in src/lib/llm/shared.ts
// won't catch them. This helper mirrors that pattern but matches on the
// HTTP status embedded in the message.
//
// Retries only on 429 (rate limit). 5xx errors are rare and bubble up to
// `handleExaSearch`, which returns them as a stringified blob so the model
// can rephrase — same fallback path used before this helper existed.

const BASE_DELAYS_MS = [1_000, 4_000, 12_000];
const JITTER = 0.25;

const RETRYABLE_RE = /^EXA 429/;

function delayWithJitter(base: number): number {
  const j = base * JITTER;
  return Math.max(0, base + (Math.random() * 2 - 1) * j);
}

export interface WithExaRetryOpts {
  /** Test override — defaults to global setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Test override — defaults to BASE_DELAYS_MS. */
  delays?: number[];
}

export async function withExaRetry<T>(
  fn: () => Promise<T>,
  opts: WithExaRetryOpts = {},
): Promise<T> {
  const delays = opts.delays ?? BASE_DELAYS_MS;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = (err as Error)?.message ?? "";
      if (!RETRYABLE_RE.test(message)) throw err;
      if (attempt === delays.length) throw err;
      await sleep(delayWithJitter(delays[attempt]));
    }
  }
  throw lastErr;
}

export function isExaRateLimitError(err: unknown): boolean {
  const message = (err as Error)?.message ?? "";
  return /^EXA 429/.test(message);
}
