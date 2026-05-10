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
  constructor(
    category: ResearchErrorCategory,
    message: string,
    opts?: { raw?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "ResearchError";
    this.category = category;
    this.raw = opts?.raw;
    this.cause = opts?.cause;
  }
}
