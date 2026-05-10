// POST /api/research — SSE orchestrator. Runs all sections in parallel, streams results,
// annotates citations with resolved/gated/dead status, isolates per-section errors.
// Citations never gate a section: see src/lib/sections/shared.ts posture comment.
import { z } from "zod";
import { SECTIONS } from "@/lib/sections/registry";
import type { SectionDefinition, CompanyInput, Citation } from "@/lib/sections/types";
import {
  findOrCreateCompany,
  touchLastRefreshed,
  updateCompanyCanonical,
} from "@/lib/companies";
import { getCachedSection, upsertCachedSection } from "@/lib/cache";
import { runResearchCall, ResearchError, selectProvider, type ProviderConfig, type Keys } from "@/lib/llm";
import { extractCitations } from "@/lib/sections/shared";
import { validateCitations, summarizeCitationStatuses, countCitationStatuses } from "@/lib/citations";
import { disambiguateCompany } from "@/lib/disambiguate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1),
  domain: z.string().nullable().optional(),
  force: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const headerKeys: Keys = {
    anthropic: request.headers.get("x-anthropic-key"),
    kimi: request.headers.get("x-kimi-key"),
    exa: request.headers.get("x-exa-key"),
  };
  const keys: Keys = {
    anthropic: headerKeys.anthropic ?? process.env.ANTHROPIC_API_KEY ?? null,
    kimi: headerKeys.kimi ?? process.env.KIMI_API_KEY ?? null,
    exa: headerKeys.exa ?? process.env.EXA_API_KEY ?? null,
  };

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (process.env.MOCK_RESEARCH === "true") {
    const { createMockResearchStream } = await import("@/lib/mock-research");
    return new Response(createMockResearchStream(body.name), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const selected = selectProvider(keys);
  if (!selected.ok) {
    const status = selected.error === "missing_api_key" ? 401 : 400;
    return new Response(
      JSON.stringify({ error: selected.error, message: selected.message }),
      { status, headers: { "content-type": "application/json" } },
    );
  }
  const config = selected.config;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[research] provider=${config.provider} search=${config.searchBackend} keySource=${
        headerKeys[config.provider] ? "header" : "env"
      }`,
    );
  }

  const company = await findOrCreateCompany(body.name, body.domain ?? null);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, payload: unknown) => {
        const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      const abort = new AbortController();
      const onAbort = () => abort.abort();
      request.signal.addEventListener("abort", onAbort);

      const closeStream = () => {
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      send("company", {
        slug: company.slug,
        name: company.display_name,
        domain: company.domain,
      });

      (async () => {
        // Pre-research disambiguation: lock in ONE canonical identity so
        // every parallel section researches the same entity.
        const disambig = await disambiguateCompany({
          config,
          name: company.display_name,
          domain: company.domain,
        });

        send("disambiguated", {
          canonical_name: disambig.canonical_name,
          canonical_domain: disambig.canonical_domain,
          one_line_description: disambig.one_line_description,
          disambiguation_note: disambig.disambiguation_note,
        });

        await updateCompanyCanonical(
          company.id,
          disambig.canonical_name,
          disambig.canonical_domain
        ).catch(() => undefined);

        const companyInput: CompanyInput = {
          name: disambig.canonical_name,
          domain: disambig.canonical_domain,
          slug: company.slug,
          one_line_description: disambig.one_line_description,
        };

        const tasks = SECTIONS.map((section) =>
          runOneSection({ config, section, companyInput, companyId: company.id, send, abort, force: body.force })
        );
        await Promise.allSettled(tasks);
        await touchLastRefreshed(company.id).catch(() => undefined);
        send("done", { slug: company.slug });
      })()
        .catch((err) => {
          const message =
            err instanceof ResearchError
              ? `${err.category}: ${err.message}`
              : (err as Error)?.message ?? "Unknown error";
          send("error", { message });
        })
        .finally(closeStream);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

type RunSectionArgs = {
  config: ProviderConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: SectionDefinition<any>;
  companyInput: CompanyInput;
  companyId: string;
  send: (event: string, payload: unknown) => void;
  abort: AbortController;
  force: boolean;
};

async function runOneSection(args: RunSectionArgs) {
  const { config, section, companyInput, companyId, send, abort, force } = args;
  const sectionKey = section.key;
  send("section_started", { section_key: sectionKey });

  try {
    if (!force) {
      const cached = await getCachedSection(companyId, section);
      if (cached) {
        send("section_completed", {
          section_key: sectionKey,
          content: cached.content,
          citations: cached.citations,
          model_version: cached.modelVersion,
          status: deriveStatus(cached.citations),
          citation_status: countCitationStatuses(cached.citations),
          from_cache: true,
        });
        return;
      }
    }

    if (abort.signal.aborted) return;

    const basePrompt = section.buildPrompt(companyInput);
    const result = await callAndValidate({
      config,
      section,
      prompt: basePrompt,
    });

    await upsertCachedSection(
      companyId,
      section,
      result.content,
      result.citations,
      result.modelVersion
    );

    send("section_completed", {
      section_key: sectionKey,
      content: result.content,
      citations: result.citations,
      model_version: result.modelVersion,
      status: deriveStatus(result.citations),
      citation_status: result.summary,
      from_cache: false,
    });
  } catch (err) {
    const reason =
      err instanceof ResearchError
        ? `${err.category}: ${err.message}`
        : err instanceof Error
        ? err.message
        : "unknown";
    if (err instanceof ResearchError) {
      console.error(`[research] section_failed key=${sectionKey} category=${err.category} message=${err.message}`, {
        cause: err.cause,
      });
    } else {
      console.error(`[research] section_failed key=${sectionKey} unknown error`, err);
    }
    send("section_failed", { section_key: sectionKey, reason });
  }
}

type CallAndValidateArgs = {
  config: ProviderConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: SectionDefinition<any>;
  prompt: string;
};

async function callAndValidate(args: CallAndValidateArgs) {
  const { config, section, prompt } = args;
  const result = await runResearchCall({
    config,
    tier: section.tier,
    prompt,
    schema: section.outputSchema,
    cacheKey: section.cacheKey,
  });

  const rawCitations = extractCitations(result.data);
  const statuses = await validateCitations(rawCitations);
  const citations: Citation[] = rawCitations.map((c, i) => ({ ...c, status: statuses[i] }));
  const summary = summarizeCitationStatuses(rawCitations, statuses);

  return {
    content: result.data,
    citations,
    modelVersion: result.modelVersion,
    summary,
  };
}

function deriveStatus(citations: Citation[]): "ok" | "stale" {
  if (citations.length === 0) return "ok";
  const dead = citations.filter((c) => c.status === "dead").length;
  return dead / citations.length > 0.30 ? "stale" : "ok";
}

