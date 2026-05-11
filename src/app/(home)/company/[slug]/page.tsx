// Company report page — wires SSE/cache state to per-section Renderers from the registry.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SECTIONS } from "@/lib/sections/registry";
import type { Citation, RendererCompany } from "@/lib/sections/types";
import { RefreshButton } from "@/components/refresh-button";
import {
  getCurrentUserId,
  migrateLegacyKeys,
  readKey,
} from "@/lib/api-keys";

type SectionState =
  | { status: "pending" }
  | { status: "completed"; content: unknown; citations: unknown; modelVersion?: string; fromCache?: boolean }
  | { status: "failed"; reason: string };

type Company = RendererCompany;

interface PageProps {
  params: { slug: string };
}

function logVisit(slug: string) {
  fetch("/api/search-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  })
    .then((res) => {
      if (res.ok && typeof window !== "undefined") {
        window.dispatchEvent(new Event("recents:updated"));
      }
    })
    .catch(() => undefined);
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
  const [phase, setPhase] = useState<"loading" | "researching" | "needs_key" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [everCompleted, setEverCompleted] = useState(false);
  const prevSectionsRef = useRef<Record<string, SectionState> | null>(null);
  const isRefresh = refreshKey > 0;

  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      try {
        // Skip cache lookup on refresh — go straight to fresh research.
        if (!isRefresh) {
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
              setEverCompleted(true);
              logVisit(slug);
              return;
            }
            // Empty company shell with no sections — fall through to research.
          } else if (cachedRes.status !== 404) {
            setErrorMsg(`Failed to load: HTTP ${cachedRes.status}`);
            setPhase("error");
            return;
          }
        }

        // Cache miss (404), empty shell, or forced refresh — kick off research.
        const userId = await getCurrentUserId();
        migrateLegacyKeys(userId);
        const keys = {
          anthropic: readKey(userId, "anthropic_api_key"),
          kimi: readKey(userId, "kimi_api_key"),
          exa: readKey(userId, "exa_api_key"),
        };

        setPhase("researching");
        await runResearch({
          slug,
          keys,
          force: isRefresh,
          signal: abort.signal,
          onCompany: (c) => setCompany(c),
          onSection: (key, state) =>
            setSections((prev) => ({ ...prev, [key]: state })),
          onDone: () => {
            setPhase("done");
            setEverCompleted(true);
            prevSectionsRef.current = null;
            logVisit(slug);
          },
          onError: (msg) => {
            if (msg === "missing_key" || msg === "missing_search_key") {
              setErrorMsg(msg);
              setPhase("needs_key");
              return;
            }
            // Refresh failed mid-stream: restore prior cached sections so the page doesn't go blank.
            if (isRefresh && prevSectionsRef.current) {
              setSections(prevSectionsRef.current);
              setPhase("done");
              toast.error(`Re-research failed: ${msg}`);
              prevSectionsRef.current = null;
              return;
            }
            setErrorMsg(msg);
            setPhase("error");
          },
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        const msg = (err as Error)?.message ?? "Unknown error";
        if (isRefresh && prevSectionsRef.current) {
          setSections(prevSectionsRef.current);
          setPhase("done");
          toast.error(`Re-research failed: ${msg}`);
          prevSectionsRef.current = null;
          return;
        }
        setErrorMsg(msg);
        setPhase("error");
      }
    })();

    return () => abort.abort();
  }, [slug, initialMap, isRefresh, refreshKey]);

  const rendererCompany: Company = {
    slug,
    display_name: company?.display_name?.trim() || humanizeSlug(slug),
    domain: company?.domain ?? null,
    logo_url: company?.logo_url ?? null,
  };

  const handleRefresh = () => {
    if (phase === "researching" || phase === "loading") return;
    prevSectionsRef.current = sections;
    setSections(initialMap);
    setErrorMsg(null);
    setPhase("researching");
    setRefreshKey((n) => n + 1);
  };

  const refreshDisabled = phase === "researching" || phase === "loading" || phase === "needs_key";
  const hasCachedReport = everCompleted;

  return (
    <div>
      {/* Top utility bar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-12 py-3.5 backdrop-blur"
        style={{
          background: "color-mix(in oklab, var(--bg) 80%, transparent)",
          borderBottom: "1px solid var(--border-faint)",
        }}
      >
        <div
          className="flex items-center gap-2.5 text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          {phase === "done" && (isRefresh ? "Re-researched · cache overwritten" : "Cached · loaded from store")}
          {phase === "researching" && (isRefresh ? "Re-researching live · streaming sections" : "Researching live · streaming sections")}
          {phase === "loading" && "Loading…"}
          {phase === "needs_key" && (
            errorMsg === "missing_search_key"
              ? "EXA key required for Kimi search"
              : "Anthropic API key required for fresh research"
          )}
          {phase === "error" && (errorMsg ?? "Error")}
        </div>
        {hasCachedReport && (
          <RefreshButton
            companyName={rendererCompany.display_name}
            disabled={refreshDisabled}
            busy={phase === "researching"}
            onConfirm={handleRefresh}
          />
        )}
      </div>

      <main className="mx-auto max-w-[1080px] px-8 lg:px-14 pt-14 pb-12">
        {phase === "needs_key" && (
          <div
            className="mb-12 rounded-md p-4 text-sm"
            style={{
              border: "1px solid var(--accent-border)",
              background: "var(--accent-bg)",
              color: "var(--text)",
            }}
          >
            {errorMsg === "missing_search_key" ? (
              <>
                Kimi requires an EXA key for web search. Add an EXA key in{" "}
                <Link className="underline font-medium" href="/settings">/settings</Link>.
              </>
            ) : (
              <>
                Set your Anthropic or Kimi API key in{" "}
                <Link className="underline font-medium" href="/settings">
                  /settings
                </Link>{" "}
                to research new companies. Cached reports load without a key.
              </>
            )}
          </div>
        )}

        {phase === "error" && errorMsg && (
          <div
            className="mb-12 rounded-md p-4 text-sm"
            style={{
              border: "1px solid hsl(var(--destructive) / 0.4)",
              background: "hsl(var(--destructive) / 0.1)",
              color: "var(--text)",
            }}
          >
            Error: {errorMsg}
          </div>
        )}

        {SECTIONS.map((section) => {
          const state = sections[section.key];
          if (state.status === "pending") {
            return (
              <div key={section.key} className="mb-[88px]">
                <section.SkeletonRenderer />
              </div>
            );
          }
          if (state.status === "failed") {
            return (
              <div
                key={section.key}
                className="mb-[88px] rounded-md p-3 text-sm"
                style={{
                  border: "1px solid hsl(var(--destructive) / 0.4)",
                  background: "hsl(var(--destructive) / 0.1)",
                }}
              >
                Couldn&apos;t generate {section.title.toLowerCase()} ({state.reason}). Try refreshing.
              </div>
            );
          }
          // completed
          const Renderer = section.Renderer as React.FC<{
            data: unknown;
            citations: Citation[];
            company: Company;
            section: { key: string; title: string; order: number };
          }>;
          return (
            <div key={section.key} className="fade-in">
              <Renderer
                data={state.content}
                citations={(state.citations as Citation[]) ?? []}
                company={rendererCompany}
                section={{
                  key: section.key,
                  title: section.title,
                  order: section.order,
                }}
              />
            </div>
          );
        })}
      </main>
    </div>
  );
}

type RunResearchArgs = {
  slug: string;
  keys: { anthropic: string | null; kimi: string | null; exa: string | null };
  force: boolean;
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
  const { slug, keys, force, signal, onCompany, onSection, onDone, onError } = args;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keys.anthropic) headers["x-anthropic-key"] = keys.anthropic;
  if (keys.kimi) headers["x-kimi-key"] = keys.kimi;
  if (keys.exa) headers["x-exa-key"] = keys.exa;

  const res = await fetch("/api/research", {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({ name: humanizeSlug(slug), domain: null, force }),
  });

  if (!res.ok || !res.body) {
    if (res.status === 401) {
      onError("missing_key");
      return;
    }
    if (res.status === 400) {
      try {
        const body = await res.clone().json();
        if (body.error === "missing_search_key") {
          onError("missing_search_key");
          return;
        }
      } catch {
        /* fall through */
      }
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
  } else if (event === "disambiguated") {
    // Server-side disambiguation may pick a cleaner canonical_name and resolve
    // the actual domain. Promote both into the rendered company so the heading
    // matches what every section is actually researching.
    const d = data as { canonical_name?: string; canonical_domain?: string | null };
    if (d.canonical_name) {
      cbs.onCompany({
        slug: "",
        display_name: d.canonical_name,
        domain: d.canonical_domain ?? null,
        logo_url: null,
      });
    }
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
