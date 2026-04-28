import { describe, it, expect } from "vitest";
import { createMockResearchStream } from "@/lib/mock-research";

const EXPECTED_SECTIONS = [
  "snapshot",
  "moat",
  "founders",
  "tech_stack",
  "funding",
  "traction",
  "market",
];

describe("createMockResearchStream", () => {
  it("replays full SSE event sequence for matching company", async () => {
    const events = await readStream(createMockResearchStream("Anthropic"));
    const types = events.map((e) => e.event);

    expect(types[0]).toBe("company");
    expect(types[1]).toBe("disambiguated");
    expect(types[types.length - 1]).toBe("done");

    const started = events
      .filter((e) => e.event === "section_started")
      .map((e) => (e.data as { section_key: string }).section_key);
    expect(new Set(started)).toEqual(new Set(EXPECTED_SECTIONS));

    const completed = events.filter((e) => e.event === "section_completed");
    expect(completed.length).toBe(7);

    for (const e of completed) {
      const d = e.data as {
        section_key: string;
        content: unknown;
        citations: unknown[];
        model_version: string;
        status: string;
        from_cache: boolean;
      };
      expect(EXPECTED_SECTIONS).toContain(d.section_key);
      expect(d.content).toBeTruthy();
      expect(Array.isArray(d.citations)).toBe(true);
      expect(typeof d.model_version).toBe("string");
      expect(d.status).toBe("ok");
      expect(d.from_cache).toBe(false);
    }

    expect(events.some((e) => e.event === "error")).toBe(false);
  });

  it("matches case-insensitively", async () => {
    const events = await readStream(createMockResearchStream("anthropic"));
    expect(events[0].event).toBe("company");
    expect(events[events.length - 1].event).toBe("done");
  });

  it("matches partial name", async () => {
    const events = await readStream(createMockResearchStream("Anthropic Inc"));
    expect(events[0].event).toBe("company");
  });

  it("returns error event for unknown company", async () => {
    const events = await readStream(createMockResearchStream("Stripe"));
    expect(events.length).toBe(1);
    expect(events[0].event).toBe("error");
    const msg = (events[0].data as { message: string }).message;
    expect(msg).toContain("no fixture");
    expect(msg).toContain("Stripe");
  });

  it("emits disambiguated event with expected fields", async () => {
    const events = await readStream(createMockResearchStream("Anthropic"));
    const disambig = events.find((e) => e.event === "disambiguated");
    expect(disambig).toBeDefined();
    const d = disambig!.data as Record<string, unknown>;
    expect(d.canonical_name).toBe("Anthropic");
    expect(d.canonical_domain).toBe("anthropic.com");
    expect(typeof d.one_line_description).toBe("string");
    expect("disambiguation_note" in d).toBe(true);
  });

  it("company event contains slug, name, domain", async () => {
    const events = await readStream(createMockResearchStream("Anthropic"));
    const d = events[0].data as { slug: string; name: string; domain: string };
    expect(d.slug).toBe("anthropic");
    expect(d.name).toBe("Anthropic");
    expect(d.domain).toBe("anthropic.com");
  });

  it("done event contains slug", async () => {
    const events = await readStream(createMockResearchStream("Anthropic"));
    const done = events.find((e) => e.event === "done");
    expect((done!.data as { slug: string }).slug).toBe("anthropic");
  });
});

async function readStream(
  stream: ReadableStream<Uint8Array>
): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const out: Array<{ event: string; data: unknown }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseFrame(frame);
      if (parsed) out.push(parsed);
    }
  }
  return out;
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
