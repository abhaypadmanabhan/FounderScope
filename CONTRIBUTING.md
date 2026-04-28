# Contributing to Founderscope

## Adding a new section

Each research section lives in `src/lib/sections/` and exports a `SectionDefinition`. Adding a section requires two steps:

### 1. Create the section file

Copy this template to `src/lib/sections/your-section.ts`:

```typescript
// Section N — Your Section: one-line description of what it shows.
"use client";
import { z } from "zod";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionDefinition } from "./types";

import { DEFAULT_MODEL, DEFAULT_WEB_SEARCH } from "./types";

// TODO(phase-2): replace with real output schema matching Claude's JSON output
const outputSchema = z.object({ placeholder: z.string() });
type Output = z.infer<typeof outputSchema>;

const Renderer: React.FC<{ data: Output; citations: unknown[] }> = ({ data }) => (
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
  title: "Your Section Title",
  order: 8,                     // must be unique across all sections
  cacheTtlDays: 14,             // how long to cache results (see PRD §5)
  schemaVersion: 1,             // bump when output shape changes incompatibly
  model: DEFAULT_MODEL,         // see "Model + tool pairing" below
  webSearchVersion: DEFAULT_WEB_SEARCH,
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
| `title` | Display name shown as the section heading. |
| `order` | Integer display order. Must be unique. |
| `cacheTtlDays` | How many days before this section's cache expires (see PRD §5 for per-section values). |
| `schemaVersion` | Bump when `outputSchema` changes incompatibly — old cache rows will be treated as expired. |
| `buildPrompt` | Returns a prompt instructing Claude to output valid JSON matching `outputSchema`. |
| `outputSchema` | Zod schema used to validate Claude's JSON output before caching. |
| `model` | Claude model id used to generate this section. See pairing rule below. |
| `webSearchVersion` | `web_search_20260209` (dynamic filtering) or `web_search_20250305` (legacy). Must be paired with `model` correctly. |
| `Renderer` | Receives `{ data: T, citations: Citation[] }` — real validated data. |
| `SkeletonRenderer` | Shown while loading. No props. |

### Model + web_search tool pairing rule

Always pair `model` and `webSearchVersion` from the same family:

- **Reasoning sections** (heavy synthesis, opinionated analysis):
  `model: REASONING_MODEL` (claude-opus-4-7) + `webSearchVersion: REASONING_WEB_SEARCH` (web_search_20260209). Gets dynamic filtering.
- **Default sections** (structured extraction, factual recall):
  `model: DEFAULT_MODEL` (claude-haiku-4-5) + `webSearchVersion: DEFAULT_WEB_SEARCH` (web_search_20250305). Legacy tool, broader model compat, ~3× cheaper than Sonnet.

Mixing versions across model families requires checking Anthropic's [web search docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) for current model-tool support. Don't assume; verify. The header comment at the top of `src/lib/sections/types.ts` is the canonical reference for the current pairing.
