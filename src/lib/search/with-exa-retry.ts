import { SearchHttpError } from "./http";

const BASE_DELAYS_MS = [1_000, 4_000, 12_000];
const JITTER = 0.25;
function delayWithJitter(base: number): number {
  const jitter = base * JITTER;
  return Math.max(0, base + (Math.random() * 2 - 1) * jitter);
}

export interface WithExaRetryOptions {
  sleep?: (ms: number) => Promise<void>;
  delays?: number[];
}

export async function withSearchRetry<T>(
  providerId: "exa" | "firecrawl" | "tavily",
  operation: () => Promise<T>,
  opts: WithExaRetryOptions = {},
): Promise<T> {
  return withRetryMatching(
    operation,
    (error) => isSearchRateLimitError(providerId, error),
    opts,
  );
}

/**
 * Keep the original exported signature and behaviour: return true when the
 * error is a rate-limit (HTTP 429) from the named provider. New code throws
 * `SearchHttpError`, so we read its fields first; the legacy message-prefix
 * fallback preserves the behaviour for any plain `Error` still in flight.
 */
export function isSearchRateLimitError(
  providerId: "exa" | "firecrawl" | "tavily",
  error: unknown,
): boolean {
  if (error instanceof SearchHttpError) {
    return error.status === 429 && error.provider.toLowerCase() === providerId;
  }
  const message = (error as Error)?.message ?? "";
  return message.startsWith(`${providerId.toUpperCase()} 429`);
}

async function withRetryMatching<T>(
  operation: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  opts: WithExaRetryOptions,
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
      if (!isRetryable(error)) throw error;
      if (attempt === delays.length) throw error;
      await sleep(delayWithJitter(delays[attempt]));
    }
  }
  throw lastError;
}
