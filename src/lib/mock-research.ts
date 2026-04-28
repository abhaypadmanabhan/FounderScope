import * as fs from "fs";
import * as path from "path";

interface MockFixture {
  company: { slug: string; name: string; domain: string };
  disambiguation: {
    canonical_name: string;
    canonical_domain: string;
    one_line_description: string;
    disambiguation_note: string | null;
  };
  sections: Record<
    string,
    {
      content: unknown;
      citations: unknown[];
      model_version: string;
    }
  >;
}

let cachedFixture: MockFixture | null = null;

function loadFixture(): MockFixture {
  if (cachedFixture) return cachedFixture;
  const filePath = path.resolve(process.cwd(), "__fixtures__/research-anthropic.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  cachedFixture = JSON.parse(raw) as MockFixture;
  return cachedFixture;
}

const SECTION_ORDER = [
  "snapshot",
  "funding",
  "founders",
  "traction",
  "tech_stack",
  "market",
  "moat",
];

const SECTION_DELAYS_MS: Record<string, number> = {
  snapshot: 200,
  funding: 220,
  founders: 280,
  traction: 300,
  tech_stack: 350,
  market: 400,
  moat: 500,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors countCitationStatuses in src/app/api/research/route.ts so the
// mock SSE stream carries the same shape as the real orchestrator.
function countMockCitationStatuses(
  citations: unknown[]
): { resolved: number; gated: number; dead: number; total: number } {
  let resolved = 0;
  let gated = 0;
  let dead = 0;
  for (const c of citations) {
    const s = (c as { status?: string }).status;
    if (s === "resolved") resolved++;
    else if (s === "gated") gated++;
    else if (s === "dead") dead++;
  }
  return { resolved, gated, dead, total: citations.length };
}

export function createMockResearchStream(companyName: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, payload: unknown) => {
        const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      (async () => {
        let fixture: MockFixture;
        try {
          fixture = loadFixture();
        } catch {
          send("error", { message: "Mock mode: failed to load fixture file." });
          controller.close();
          return;
        }

        const nameMatch =
          companyName.toLowerCase().includes(fixture.company.name.toLowerCase()) ||
          fixture.company.name.toLowerCase().includes(companyName.toLowerCase());

        if (!nameMatch) {
          send("error", {
            message: `Mock mode: no fixture for '${companyName}'. Only '${fixture.company.name}' available.`,
          });
          controller.close();
          return;
        }

        send("company", fixture.company);

        await delay(150);
        send("disambiguated", fixture.disambiguation);

        await delay(100);
        for (const key of SECTION_ORDER) {
          send("section_started", { section_key: key });
          await delay(50);
        }

        for (const key of SECTION_ORDER) {
          const section = fixture.sections[key];
          if (!section) continue;
          await delay(SECTION_DELAYS_MS[key] ?? 300);
          send("section_completed", {
            section_key: key,
            content: section.content,
            citations: section.citations,
            model_version: section.model_version,
            status: "ok",
            citation_status: countMockCitationStatuses(section.citations),
            from_cache: false,
          });
        }

        await delay(50);
        send("done", { slug: fixture.company.slug });
      })()
        .catch((err) => {
          send("error", { message: (err as Error)?.message ?? "Unknown mock error" });
        })
        .finally(() => {
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
  });
}
