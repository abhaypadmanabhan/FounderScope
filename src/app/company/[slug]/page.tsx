// Company report page — phase 2 renders raw JSON dumps per section.
// Phase 3 will replace with section-specific UIs from the registry.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SECTIONS } from "@/lib/sections/registry";

type SectionState =
  | { status: "pending" }
  | { status: "completed"; content: unknown; citations: unknown; modelVersion?: string; fromCache?: boolean }
  | { status: "failed"; reason: string };

type Company = {
  slug: string;
  display_name: string;
  domain: string | null;
};

interface PageProps {
  params: { slug: string };
}

export default function CompanyPage({ params }: PageProps) {
  const slug = params.slug;
  const initialMap = useMemo(() => {
    const m: Record<string, SectionState> = {};
    for (const s of SECTIONS) m[s.key] = { status: "pending" };
    return m;
  }, []);

  const [sections, setSections] = useState<Record<string, SectionState>>(initialMap);
  const [company, setCompany] = useState<Company | null>(null);
  const [phase, setPhase] = useState<"loading" | "cached" | "researching" | "needs_key" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      try {
        const cachedRes = await fetch(`/api/companies/${slug}`, { signal: abort.signal });
        if (cachedRes.ok) {
          const data = (await cachedRes.json()) as {
            company: Company;
            sections: Array<{
              section_key: string;
              content: unknown;
              citations: unknown;
              model_version: string;
            }>;
          };
          setCompany(data.company);
          if (data.sections && data.sections.length > 0) {
            const map: Record<string, SectionState> = { ...initialMap };
            for (const s of data.sections) {
              map[s.section_key] = {
                status: "completed",
                content: s.content,
                citations: s.citations,
                modelVersion: s.model_version,
                fromCache: true,
              };
            }
            setSections(map);
            setPhase("done");
            return;
          }
          // Empty company shell with no sections — fall through to research.
        } else if (cachedRes.status !== 404) {
          setErrorMsg(`Failed to load: HTTP ${cachedRes.status}`);
          setPhase("error");
          return;
        }

        // Cache miss (404) or empty shell — kick off research.
        const apiKey = typeof window !== "undefined"
          ? window.localStorage.getItem("anthropic_api_key")
          : null;

        setPhase("researching");
        await runResearch({
          slug,
          apiKey,
          signal: abort.signal,
          onCompany: (c) => setCompany(c),
          onSection: (key, state) =>
            setSections((prev) => ({ ...prev, [key]: state })),
          onDone: () => setPhase("done"),
          onError: (msg) => {
            if (msg === "missing_key") {
              setPhase("needs_key");
            } else {
              setErrorMsg(msg);
              setPhase("error");
            }
          },
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setErrorMsg((err as Error)?.message ?? "Unknown error");
        setPhase("error");
      }
    })();

    return () => abort.abort();
  }, [slug, initialMap]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {company?.display_name ?? slug.replace(/-/g, " ")}
        </h1>
        {company?.domain && (
          <p className="text-sm text-muted-foreground">{company.domain}</p>
        )}
        <p className="text-xs text-muted-foreground">phase: {phase}</p>
      </header>

      {phase === "needs_key" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Set your Anthropic API key in{" "}
          <Link className="underline font-medium" href="/settings">/settings</Link>
          {" "}to research new companies. Cached reports load without a key.
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Error: {errorMsg}
        </div>
      )}

      {SECTIONS.map((section) => {
        const state = sections[section.key];
        return (
          <section key={section.key} aria-labelledby={`section-${section.key}`}>
            <h2 id={`section-${section.key}`} className="text-lg font-semibold mb-4">
              {section.title}
            </h2>
            {state.status === "pending" && <section.SkeletonRenderer />}
            {state.status === "completed" && (
              <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3 overflow-x-auto">
                {JSON.stringify(state.content, null, 2)}
              </pre>
            )}
            {state.status === "failed" && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Couldn&apos;t generate this section ({state.reason}). Try refreshing.
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

type RunResearchArgs = {
  slug: string;
  apiKey: string | null;
  signal: AbortSignal;
  onCompany: (c: Company) => void;
  onSection: (key: string, state: SectionState) => void;
  onDone: () => void;
  onError: (msg: string) => void;
};

function humanizeSlug(s: string): string {
  return s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function runResearch(args: RunResearchArgs) {
  const { slug, apiKey, signal, onCompany, onSection, onDone, onError } = args;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-anthropic-key"] = apiKey;

  const res = await fetch("/api/research", {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({ name: humanizeSlug(slug), domain: null }),
  });

  if (!res.ok || !res.body) {
    if (res.status === 401) {
      onError("missing_key");
      return;
    }
    onError(`Research call failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseFrame(frame);
      if (!parsed) continue;
      handleEvent(parsed.event, parsed.data, { onCompany, onSection, onDone, onError });
    }
  }
}

function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event = "message";
  let dataLine = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return null;
  try {
    return { event, data: JSON.parse(dataLine) };
  } catch {
    return null;
  }
}

function handleEvent(
  event: string,
  data: unknown,
  cbs: Pick<RunResearchArgs, "onCompany" | "onSection" | "onDone" | "onError">
) {
  if (event === "company") {
    cbs.onCompany(data as Company);
  } else if (event === "section_started") {
    const d = data as { section_key: string };
    cbs.onSection(d.section_key, { status: "pending" });
  } else if (event === "section_completed") {
    const d = data as {
      section_key: string;
      content: unknown;
      citations: unknown;
      model_version?: string;
      from_cache?: boolean;
    };
    cbs.onSection(d.section_key, {
      status: "completed",
      content: d.content,
      citations: d.citations,
      modelVersion: d.model_version,
      fromCache: d.from_cache,
    });
  } else if (event === "section_failed") {
    const d = data as { section_key: string; reason: string };
    cbs.onSection(d.section_key, { status: "failed", reason: d.reason });
  } else if (event === "done") {
    cbs.onDone();
  } else if (event === "error") {
    const d = data as { message: string };
    cbs.onError(d.message);
  }
}
