const BASE_DELAYS_MS = [1_000, 4_000, 12_000];
const JITTER = 0.25;
const RETRYABLE_RE = /^EXA 429/;

function delayWithJitter(base: number): number {
  const jitter = base * JITTER;
  return Math.max(0, base + (Math.random() * 2 - 1) * jitter);
}

export interface WithExaRetryOptions {
  sleep?: (ms: number) => Promise<void>;
  delays?: number[];
}

export async function withExaRetry<T>(
  operation: () => Promise<T>,
  opts: WithExaRetryOptions = {},
): Promise<T> {
  const delays = opts.delays ?? BASE_DELAYS_MS;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = (error as Error)?.message ?? "";
      if (!RETRYABLE_RE.test(message)) throw error;
      if (attempt === delays.length) throw error;
      await sleep(delayWithJitter(delays[attempt]));
    }
  }
  throw lastError;
}

export function isExaRateLimitError(error: unknown): boolean {
  const message = (error as Error)?.message ?? "";
  return /^EXA 429/.test(message);
}
