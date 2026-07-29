import { z } from "zod";
import { responseError } from "./http";
import type { SearchRequest } from "./request";
import type { SearchResult } from "./types";

const EXA_ENDPOINT = "https://api.exa.ai/search";

const exaResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().nullish(),
        url: z.union([z.string(), z.number()]).nullish(),
        highlights: z.array(z.string()).nullish(),
      }),
    )
    .nullish(),
});

const exaLogoResponseSchema = z.object({
  results: z
    .array(
      z.object({
        favicon: z.string().nullish(),
        extras: z
          .object({ imageLinks: z.array(z.string()).nullish() })
          .nullish(),
      }),
    )
    .nullish(),
});

export async function exaSearch(
  input: SearchRequest,
  apiKey: string,
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = {
    query: input.query,
    type: "auto",
    numResults: input.numResults ?? 5,
    contents: { highlights: true },
  };
  if (input.includeDomains && input.includeDomains.length > 0) {
    body.includeDomains = input.includeDomains;
  }
  if (input.excludeDomains && input.excludeDomains.length > 0) {
    body.excludeDomains = input.excludeDomains;
  }
  if (input.startPublishedDate) {
    body.startPublishedDate = input.startPublishedDate;
  }
  if (input.livecrawl) {
    body.livecrawl = input.livecrawl;
  }

  const response = await fetch(EXA_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError("EXA", response);

  const parsed = exaResponseSchema.safeParse(await response.json());
  if (!parsed.success) return [];
  return (parsed.data.results ?? []).map((result) => ({
    title: result.title ?? "",
    url: legacyString(result.url),
    highlights: result.highlights ?? [],
  }));
}

// The legacy mapper was compile-time string-typed but preserved a numeric URL
// at runtime. Retain that tolerance until downstream validation owns cleanup.
function legacyString(value: string | number | null | undefined): string {
  return value == null ? "" : (value as string);
}

const LOGO_TIMEOUT_MS = 5_000;

export async function exaCompanyLogo(
  input: { name: string; domain: string | null },
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    query: `${input.name} official site`,
    type: "auto",
    numResults: 1,
    contents: { extras: { imageLinks: 1 } },
  };
  if (input.domain) body.includeDomains = [input.domain];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
  try {
    const response = await fetch(EXA_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const parsed = exaLogoResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const top = parsed.data.results?.[0];
    if (!top) return null;
    return top.extras?.imageLinks?.[0] ?? top.favicon ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
