// Citation validation: HEAD/GET probing with gated-domain trust layer.
import type { Citation, CitationStatus } from "./sections/types";

export const GATED_DOMAINS = [
  "linkedin.com",
  "crunchbase.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "nytimes.com",
  "theinformation.com",
  "sec.gov/cgi-bin",
  "pitchbook.com",
  "tracxn.com",
];

const VALIDATE_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const UA = "Mozilla/5.0 (compatible; Founderscope/1.0)";

type ValidationResult = { status: CitationStatus; httpCode?: number };

function isGatedDomain(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  for (const gate of GATED_DOMAINS) {
    if (gate.includes("/")) {
      // path-prefix gate (e.g. sec.gov/cgi-bin)
      const [gHost, ...rest] = gate.split("/");
      const gPath = "/" + rest.join("/");
      if ((host === gHost || host.endsWith("." + gHost)) && url.pathname.startsWith(gPath)) {
        return true;
      }
    } else {
      if (host === gate || host.endsWith("." + gate)) return true;
    }
  }
  return false;
}

export async function validateCitation(c: Citation): Promise<ValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(c.url);
  } catch {
    return { status: "dead" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "dead" };
  }

  if (isGatedDomain(parsed)) return { status: "gated" };

  const probe = async (method: "HEAD" | "GET", extraHeaders?: Record<string, string>) => {
    return await fetchFollowingRedirects(parsed.toString(), {
      method,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        ...extraHeaders,
      },
    });
  };

  let res: Response;
  try {
    res = await probe("HEAD");
    if (res.status === 405 || res.status === 501) {
      res = await probe("GET", { Range: "bytes=0-1023" });
    }
  } catch {
    return { status: "dead" };
  }

  return mapStatus(res.status);
}

function mapStatus(code: number): ValidationResult {
  if (code >= 200 && code < 400) return { status: "resolved", httpCode: code };
  if (code === 401 || code === 403 || code === 429 || code === 503) {
    return { status: "gated", httpCode: code };
  }
  if (code === 404 || code === 410) return { status: "dead", httpCode: code };
  if (code >= 500) return { status: "gated", httpCode: code };
  return { status: "dead", httpCode: code };
}

async function fetchFollowingRedirects(
  url: string,
  init: RequestInit
): Promise<Response> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  // Too many redirects → treat as dead
  return new Response(null, { status: 599 });
}

export async function validateCitations(
  citations: Citation[],
  concurrency = 10
): Promise<CitationStatus[]> {
  const results: CitationStatus[] = new Array(citations.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= citations.length) return;
      try {
        const r = await validateCitation(citations[i]);
        results[i] = r.status;
      } catch {
        results[i] = "dead";
      }
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(concurrency, Math.max(1, citations.length));
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// Annotation only — never gates a section. See src/lib/sections/shared.ts
// posture comment: citations are signal, not a pass/fail check.
export function summarizeCitationStatuses(
  citations: Citation[],
  statuses: CitationStatus[]
): { resolved: number; gated: number; dead: number; total: number } {
  let dead = 0;
  let gated = 0;
  let resolved = 0;
  for (const s of statuses) {
    if (s === "dead") dead++;
    else if (s === "gated") gated++;
    else if (s === "resolved") resolved++;
  }
  return { resolved, gated, dead, total: citations.length };
}

// Same shape as summarizeCitationStatuses but reads status off enriched
// Citation objects. Used by cache-hit paths (SSE + GET) where citations
// already carry the status field set during fresh validation.
export function countCitationStatuses(
  citations: Citation[]
): { resolved: number; gated: number; dead: number; total: number } {
  let resolved = 0;
  let gated = 0;
  let dead = 0;
  for (const c of citations) {
    const s: CitationStatus | undefined = c.status;
    if (s === "resolved") resolved++;
    else if (s === "gated") gated++;
    else if (s === "dead") dead++;
  }
  return { resolved, gated, dead, total: citations.length };
}
