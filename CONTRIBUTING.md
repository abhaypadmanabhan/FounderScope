# Contributing to Founderscope

## Adding a new section

Each research section lives in `src/lib/sections/` and exports a `SectionDefinition`. Adding a section requires two steps:

### 1. Create the section file

Copy this template to `src/lib/sections/your-section.tsx`:

```tsx
// Section N — Your Section: one-line description of what it shows.
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition, RendererProps } from "./types";

// Replace with the real output schema the model must return.
const outputSchema = z.object({ placeholder: z.string() });
type Output = z.infer<typeof outputSchema>;

const Renderer: React.FC<RendererProps<Output>> = ({ data }) => (
  React.createElement("div", null, data.placeholder)
);

const SkeletonRenderer: React.FC = () => (
  React.createElement("div", { className: "space-y-2" },
    React.createElement(Skeleton, { className: "h-4 w-3/4" }),
    React.createElement(Skeleton, { className: "h-4 w-1/2" }),
    React.createElement(Skeleton, { className: "h-4 w-5/6" }),
  )
);

export const yourSection: SectionDefinition<Output> = {
  key: "your_section",          // stable DB key — never rename after launch
  cacheKey: "founderscope:section:your_section",  // stable prompt-cache key
  title: "Your Section Title",
  order: 8,                     // must be unique across all sections
  cacheTtlDays: 14,             // how long to cache results (see PRD §5)
  schemaVersion: 1,             // bump when output shape changes incompatibly
  tier: "default",              // "default" | "reasoning" — see "Model tiers" below
  buildPrompt: (company) => `TODO: prompt for ${company.name}`,
  outputSchema,
  Renderer,
  SkeletonRenderer,
};
```

### 2. Register it

In `src/lib/sections/registry.ts`, add one import and one entry:

```typescript
import { yourSection } from "./your-section";

export const SECTIONS: SectionDefinition[] = [
  snapshot, moat, founders, techStack, funding, traction, market,
  yourSection,  // ← add here
].sort((a, b) => a.order - b.order);
```

That's it. No DB migration needed — `reports.section_key` is a text column and `content_json` is jsonb. The report page and research orchestrator iterate `SECTIONS` at runtime.

### Section contract (PRD §7.3)

| Field | Description |
|-------|-------------|
| `key` | Stable identifier used as `section_key` in the DB. Never rename after the first report is cached. |
| `cacheKey` | Stable prompt-cache key, `founderscope:section:<key>`. Never rename. |
| `title` | Display name shown as the section heading. |
| `order` | Integer display order. Must be unique. |
| `cacheTtlDays` | How many days before this section's cache expires (see PRD §5 for per-section values). |
| `schemaVersion` | Bump when `outputSchema` changes incompatibly — old cache rows will be treated as expired. |
| `buildPrompt` | Returns a prompt instructing the model to output valid JSON matching `outputSchema`. |
| `outputSchema` | Zod schema used to validate the model's JSON output before caching. |
| `tier` | `"default"` or `"reasoning"`. See below. Sections never name a model id. |
| `Renderer` | Receives `{ data: T, citations: Citation[], company, section }` — real validated data. |
| `SkeletonRenderer` | Shown while loading. No props. |

### Model tiers

All inference routes through OpenRouter. A section declares a `tier`; the
tier → model map lives in `src/lib/llm/models.ts` and is the single place a
model id appears.

- **`reasoning`** — heavy synthesis, opinionated analysis. Currently
  `deepseek/deepseek-v4-pro`. Used only by `moat`.
- **`default`** — structured extraction, factual recall. Currently
  `google/gemini-3.1-flash-lite`. Used by the other six sections and by
  disambiguation.

Do not hardcode a model id in a section, and do not add a per-section web-search
setting. There is one `web_search` tool, defined in `src/lib/llm/openrouter.ts`
and backed by a swappable provider in `src/lib/search/` (EXA, Firecrawl, or
Tavily). Search is required, not optional — no model in the map ships a built-in
one. The header comment at the top of `src/lib/sections/types.ts` is the
canonical reference for the tier rule.
