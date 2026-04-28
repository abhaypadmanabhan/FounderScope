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
import { runResearchCall, ResearchError } from "@/lib/anthropic";
import { extractCitations } from "@/lib/sections/shared";
import { validateCitations, summarizeCitationStatuses, countCitationStatuses } from "@/lib/citations";
import { disambiguateCompany } from "@/lib/disambiguate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1),
  domain: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const headerKey = request.headers.get("x-anthropic-key");
  const envKey = process.env.ANTHROPIC_API_KEY;
  const apiKey = headerKey || envKey;
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

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "missing_api_key",
        message: "Provide x-anthropic-key header or set ANTHROPIC_API_KEY in env.",
      }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[research] api key source: ${headerKey ? "header" : "env"}`);
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
          apiKey,
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
          runOneSection({ apiKey, section, companyInput, companyId: company.id, send, abort })
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
  apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: SectionDefinition<any>;
  companyInput: CompanyInput;
  companyId: string;
  send: (event: string, payload: unknown) => void;
  abort: AbortController;
};

async function runOneSection(args: RunSectionArgs) {
  const { apiKey, section, companyInput, companyId, send, abort } = args;
  const sectionKey = section.key;
  send("section_started", { section_key: sectionKey });

  try {
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

    if (abort.signal.aborted) return;

    const basePrompt = section.buildPrompt(companyInput);
    const result = await callAndValidate({
      apiKey,
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
  apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: SectionDefinition<any>;
  prompt: string;
};

async function callAndValidate(args: CallAndValidateArgs) {
  const { apiKey, section, prompt } = args;
  const result = await runResearchCall({
    apiKey,
    model: section.model,
    webSearchVersion: section.webSearchVersion,
    prompt,
    schema: section.outputSchema,
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

