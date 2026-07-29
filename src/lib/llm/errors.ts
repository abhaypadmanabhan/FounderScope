export type ResearchErrorCategory =
  | "schema_validation"
  | "model_error"
  | "auth_error"
  | "rate_limit"
  | "timeout";

export class ResearchError extends Error {
  category: ResearchErrorCategory;
  raw?: string;
  cause?: unknown;
  /**
   * Whether retrying the whole call is worth the money. Defaults to true for
   * the retryable categories. A total-loop timeout sets this false: one attempt
   * is now the entire tool loop, so retrying it re-pays for a full search
   * budget and a full token spend to repeat a run that already failed to
   * converge. A single slow step is a different thing and stays retryable.
   */
  retryable?: boolean;
  constructor(
    category: ResearchErrorCategory,
    message: string,
    opts?: { raw?: string; cause?: unknown; retryable?: boolean },
  ) {
    super(message);
    this.name = "ResearchError";
    this.category = category;
    this.raw = opts?.raw;
    this.cause = opts?.cause;
    this.retryable = opts?.retryable;
  }
}
