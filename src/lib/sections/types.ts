// Core type contracts for the section registry — every section implements SectionDefinition.
//
// Model + web_search tool pairing rule:
//   REASONING_MODEL (opus-4-7) + REASONING_WEB_SEARCH (20260209)
//     — used by moat; gets dynamic filtering for dense research.
//   DEFAULT_MODEL (haiku-4-5) + DEFAULT_WEB_SEARCH (20250305)
//     — used by the other six sections; legacy tool, broader compat.
// When adding a new section, keep these paired. Mixing versions
// across model families requires checking Anthropic's docs first.
import type { ZodType } from "zod";
import type React from "react";

export const DEFAULT_MODEL = "claude-haiku-4-5";
export const REASONING_MODEL = "claude-opus-4-7";

export type WebSearchToolVersion =
  | "web_search_20260209" // dynamic filtering, Opus 4.7/4.6 + Sonnet 4.6
  | "web_search_20250305"; // legacy, broader model support

export const DEFAULT_WEB_SEARCH: WebSearchToolVersion = "web_search_20250305";
export const REASONING_WEB_SEARCH: WebSearchToolVersion = "web_search_20260209";

export type CompanyInput = {
  name: string;
  domain: string | null;
  slug: string;
  one_line_description: string;
};

export type CitationStatus = "resolved" | "gated" | "dead";

export type Citation = {
  id: number;
  url: string;
  quote: string;
  claim: string;
  status?: CitationStatus;
};

export interface SectionDefinition<T = unknown> {
  key: string;
  title: string;
  order: number;
  cacheTtlDays: number;
  schemaVersion: number;
  model: string;
  webSearchVersion: WebSearchToolVersion;
  buildPrompt: (company: CompanyInput) => string;
  outputSchema: ZodType<T>;
  Renderer: React.FC<{ data: T; citations: Citation[] }>;
  SkeletonRenderer: React.FC;
}
