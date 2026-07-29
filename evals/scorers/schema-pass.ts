import { SECTIONS, getSection } from "@/lib/sections/registry";
import type { ResearchEvalOutput } from "../types";

/** Fraction of sections whose content passes Zod validation (0–1). */
export function scoreSchemaPass(output: ResearchEvalOutput): number {
  if (output.sections.length === 0) return 0;

  let passed = 0;
  for (const section of output.sections) {
    const def = getSection(section.sectionKey);
    if (!def) continue;
    const result = def.outputSchema.safeParse(section.content);
    if (result.success) passed++;
  }

  return passed / output.sections.length;
}

/** Validate a single section by key; used in unit tests and per-section debugging. */
export function sectionSchemaPasses(
  sectionKey: string,
  content: unknown
): boolean {
  const def = getSection(sectionKey);
  if (!def) return false;
  return def.outputSchema.safeParse(content).success;
}

export const EXPECTED_SECTION_COUNT = SECTIONS.length;
