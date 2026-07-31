// Core type contracts for the section registry — every section implements SectionDefinition.
//
// Tier rule:
//   "reasoning" — used by moat; maps to deepseek/deepseek-v4-pro.
//   "default"   — used by the other six sections; maps to google/gemini-3.1-flash-lite.
// src/lib/llm/models.ts resolves tier → concrete model; every call goes through
// OpenRouter. There is one `web_search` tool, backed by a swappable search
// provider (EXA/Firecrawl/Tavily) — sections never name a model or a tool version.
import type { ZodType } from "zod";
import type React from "react";

import type { ModelTier } from "@/lib/llm/types";
export type { ModelTier };

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

// Lightweight company info passed into section renderers (for logo, slug links, etc.).
export type RendererCompany = {
  slug: string;
  display_name: string;
  domain: string | null;
  logo_url: string | null;
};

// Section identity passed into every Renderer. Lets renderers stop hardcoding
// their own eyebrow/order and lets future code derive anchor IDs from key.
export type RendererSection = {
  key: string;
  title: string;
  order: number;
};

export type RendererProps<T> = {
  data: T;
  citations: Citation[];
  company: RendererCompany;
  section: RendererSection;
};

export interface SectionDefinition<T = unknown> {
  key: string;
  /** Stable prompt-cache key for providers that key caches on string equality. Format: "founderscope:section:<key>". */
  cacheKey: string;
  title: string;
  order: number;
  cacheTtlDays: number;
  schemaVersion: number;
  tier: ModelTier;
  buildPrompt: (company: CompanyInput) => string;
  outputSchema: ZodType<T>;
  Renderer: React.FC<RendererProps<T>>;
  SkeletonRenderer: React.FC;
}
