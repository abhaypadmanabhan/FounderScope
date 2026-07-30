/**
 * A search-backend failure with structured metadata. Previously every HTTP
 * error was a plain `Error` whose message had to be re-parsed to decide
 * whether to retry (e.g. `startsWith("EXA 429")`). Carrying the provider and
 * status as fields lets retry and budget classification read them directly.
 */
export class SearchHttpError extends Error {
  readonly name = "SearchHttpError";

  constructor(
    readonly provider: string,
    readonly status: number,
    readonly responseText: string,
  ) {
    super(`${provider} ${status}: ${responseText || "HTTP error"}`);
  }
}

export async function responseError(
  provider: string,
  response: Response,
): Promise<Error> {
  const text = await response.text().catch(() => "");
  return new SearchHttpError(provider, response.status, text);
}
