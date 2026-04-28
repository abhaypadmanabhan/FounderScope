// Central registry — all sections sorted by order. Add new sections here.
import type { SectionDefinition } from "./types";
import { snapshot } from "./snapshot";
import { moat } from "./moat";
import { founders } from "./founders";
import { techStack } from "./tech-stack";
import { funding } from "./funding";
import { traction } from "./traction";
import { market } from "./market";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTIONS: SectionDefinition<any>[] = [
  snapshot,
  moat,
  founders,
  techStack,
  funding,
  traction,
  market,
].sort((a, b) => a.order - b.order);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSection(key: string): SectionDefinition<any> | undefined {
  return SECTIONS.find((s) => s.key === key);
}
