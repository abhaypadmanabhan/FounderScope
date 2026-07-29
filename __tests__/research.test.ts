// Integration test for /api/research orchestrator: mocks SDK + cache + fetch,
// asserts SSE event ordering, per-section persistence, and single-call-per-section
// (no retry under the founder-intel posture; see src/lib/sections/shared.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";

const promptHistory: string[] = [];
const upsertCalls: Array<{ section_key: string; content: unknown }> = [];
type SdkCall = {
  prompt: string;
  model: string;
  toolNames: string[];
  maxOutputTokens?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: any;
};
const sdkCalls: SdkCall[] = [];

// ---- Mocks (declared before the route import) ----

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: () => undefined, getAll: () => [] }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
    }),
  }),
}));

vi.mock("@/lib/companies", () => ({
  findOrCreateCompany: vi.fn(async () => ({
    id: "co-1",
    slug: "stripe",
    display_name: "Stripe",
    domain: null,
    logo_url: null,
    last_refreshed_at: null,
  })),
  touchLastRefreshed: vi.fn(async () => undefined),
  updateCompanyCanonical: vi.fn(async () => undefined),
  getCompanyBySlug: vi.fn(async () => null),
}));

vi.mock("@/lib/cache", () => ({
  getCachedSection: vi.fn(async () => null),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertCachedSection: vi.fn(async (_cid: string, section: any, content: unknown) => {
    upsertCalls.push({ section_key: section.key, content });
  }),
}));

// The AI SDK's generateText is the whole provider surface now — one mock
// replaces the two adapter SDK mocks this file used to carry. `tool`, `Output`
// and the error classes stay real so the route's own wiring is still exercised.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateText: async (params: any) => {
      const prompt = String(params.prompt);
      promptHistory.push(prompt);
      const model = params.model?.modelId ?? String(params.model);
      sdkCalls.push({
        prompt,
        model,
        toolNames: Object.keys(params.tools ?? {}),
        maxOutputTokens: params.maxOutputTokens,
        providerOptions: params.providerOptions,
      });
      const text = cannedJsonForPrompt(prompt);
      return {
        output: JSON.parse(text),
        text,
        response: { modelId: model },
      };
    },
  };
});

// Mock fetch for citation validation
const originalFetch = global.fetch;
beforeEach(() => {
  promptHistory.length = 0;
  upsertCalls.length = 0;
  sdkCalls.length = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async (url: any) => {
    const u = typeof url === "string" ? url : (url as URL).toString();
    if (u.includes("dead.example.com")) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, { status: 200 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---- Test ----

import { POST } from "@/app/api/research/route";

describe("/api/research orchestrator", () => {
  it("streams 7 sections and persists all (no retry path)", async () => {
    const req = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openrouter-key": "sk-or-v1-test",
        "x-search-key": "exa-test",
      },
      body: JSON.stringify({ name: "Stripe", domain: null }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readEvents(res);
    const types = events.map((e) => e.event);

    expect(types[0]).toBe("company");
    expect(types).toContain("done");

    // exa_usage event emitted right before done, carries the aggregated counter
    // shape even when the model never called the search tool.
    const exaUsageEvent = events.find((e) => e.event === "exa_usage");
    expect(exaUsageEvent).toBeDefined();
    const usagePayload = exaUsageEvent!.data as Record<string, unknown>;
    expect(usagePayload).toMatchObject({
      calls: expect.any(Number),
      cache_hits: expect.any(Number),
      rate_limit_429s: expect.any(Number),
      fallback_hits: expect.any(Number),
      total_claims: expect.any(Number),
      cited_claims: expect.any(Number),
    });
    expect(types.indexOf("exa_usage")).toBeLessThan(types.indexOf("done"));

    const startedKeys = events
      .filter((e) => e.event === "section_started")
      .map((e) => (e.data as { section_key: string }).section_key);
    expect(new Set(startedKeys).size).toBe(7);

    const completedKeys = events
      .filter((e) => e.event === "section_completed")
      .map((e) => (e.data as { section_key: string }).section_key);
    expect(new Set(completedKeys).size).toBe(7);
    expect(events.some((e) => e.event === "section_failed")).toBe(false);

    expect(upsertCalls.length).toBe(7);
    expect(new Set(upsertCalls.map((c) => c.section_key))).toEqual(
      new Set(["snapshot", "moat", "founders", "tech_stack", "funding", "traction", "market"])
    );

    // Lock in the no-retry behavior: each section is called exactly once,
    // even with a dead citation in the response. Citations are annotation,
    // not a gate.
    const moatPrompts = promptHistory.filter((p) => p.includes("MOAT analysis"));
    expect(moatPrompts.length).toBe(1);
    expect(moatPrompts.some((p) => p.includes("RETRY:"))).toBe(false);

    // Disambiguation: emitted before any section_started, and exactly one Haiku call.
    const disambigEvent = events.find((e) => e.event === "disambiguated");
    expect(disambigEvent).toBeDefined();
    expect((disambigEvent!.data as { canonical_name: string }).canonical_name).toBe("Stripe");
    const firstStartedIdx = events.findIndex((e) => e.event === "section_started");
    const disambigIdx = events.findIndex((e) => e.event === "disambiguated");
    expect(disambigIdx).toBeLessThan(firstStartedIdx);

    const disambigCalls = sdkCalls.filter((c) => c.prompt.includes("canonical_name"));
    expect(disambigCalls.length).toBe(1);
    expect(disambigCalls[0].model).toBe("google/gemini-3.1-flash-lite");

    // Schema-in-prompt: every section call carries the JSON schema, an example,
    // and the canonical one_line_description from disambiguation.
    const sectionCalls = sdkCalls.filter((c) => !c.prompt.includes("canonical_name"));
    for (const call of sectionCalls) {
      expect(call.prompt).toContain("JSON SCHEMA:");
      expect(call.prompt).toContain("EXAMPLE OUTPUT");
      expect(call.prompt).toContain("Payments infrastructure for the internet");
    }

    // Per-section model + tool version pairing.
    const moatCalls = sectionCalls.filter((c) => c.prompt.includes("MOAT analysis"));
    const nonMoatCalls = sectionCalls.filter((c) => !c.prompt.includes("MOAT analysis"));

    expect(moatCalls.length).toBeGreaterThan(0);
    for (const call of moatCalls) {
      expect(call.model).toBe("deepseek/deepseek-v4-pro");
      expect(call.maxOutputTokens).toBe(16384);
      expect(call.toolNames).toEqual(["web_search"]);
      expect(call.providerOptions?.openrouter?.reasoning?.enabled).toBe(true);
    }

    expect(nonMoatCalls.length).toBe(6);
    for (const call of nonMoatCalls) {
      expect(call.model).toBe("google/gemini-3.1-flash-lite");
      expect(call.maxOutputTokens).toBe(8192);
      expect(call.toolNames).toEqual(["web_search"]);
      expect(call.providerOptions).toBeUndefined();
    }
  });

  // MOCK_RESEARCH short-circuits before auth, key selection and the provider,
  // so frontend work never needs a key. It has to survive the provider swap.
  it("still serves a full mock run under MOCK_RESEARCH=true with no keys at all", async () => {
    const savedMock = process.env.MOCK_RESEARCH;
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedExa = process.env.EXA_API_KEY;
    process.env.MOCK_RESEARCH = "true";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.EXA_API_KEY;
    try {
      // The only mock fixture is the Anthropic company report — the name has
      // to match it or the mock stream answers with an error frame.
      const req = new Request("http://localhost/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Anthropic", domain: null }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/event-stream");

      const events = await readEvents(res);
      const types = events.map((e) => e.event);
      expect(types[0]).toBe("company");
      expect(types).toContain("disambiguated");
      expect(types).toContain("done");
      const completed = events
        .filter((e) => e.event === "section_completed")
        .map((e) => (e.data as { section_key: string }).section_key);
      expect(new Set(completed).size).toBe(7);
      // No provider call was made — the mock stream never touches generateText.
      expect(sdkCalls.length).toBe(0);
    } finally {
      if (savedMock === undefined) delete process.env.MOCK_RESEARCH;
      else process.env.MOCK_RESEARCH = savedMock;
      if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
      if (savedExa !== undefined) process.env.EXA_API_KEY = savedExa;
    }
  });

  it("uses OPENROUTER_API_KEY / EXA_API_KEY env fallback when no key headers are sent", async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedExa = process.env.EXA_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-v1-env-test";
    process.env.EXA_API_KEY = "exa-env-test";
    try {
      const req = new Request("http://localhost/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Stripe", domain: null }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    } finally {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      if (savedExa === undefined) delete process.env.EXA_API_KEY;
      else process.env.EXA_API_KEY = savedExa;
    }
  });

  it("returns 401 when neither x-openrouter-key header nor OPENROUTER_API_KEY env is set", async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const req = new Request("http://localhost/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Stripe", domain: null }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("missing_api_key");
    } finally {
      if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
    }
  });

  // Search is required, not optional: no model in the map has a native
  // web-search tool, so an OpenRouter key alone would produce an ungrounded
  // report. Same 400 contract the Kimi-without-EXA case used to return.
  it("returns 400 missing_search_key when only an OpenRouter key is provided", async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedExa = process.env.EXA_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.EXA_API_KEY;
    try {
      const req = new Request("http://localhost/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openrouter-key": "sk-or-v1-test",
        },
        body: JSON.stringify({ name: "Stripe", domain: null }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("missing_search_key");
    } finally {
      if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
      if (savedExa !== undefined) process.env.EXA_API_KEY = savedExa;
    }
  });
});

// ---- Helpers ----

async function readEvents(res: Response): Promise<Array<{ event: string; data: unknown }>> {
  const reader = res.body!.getReader();
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

function cannedJsonForPrompt(prompt: string): string {
  if (prompt.includes("canonical_name") && prompt.includes("disambiguation_note")) {
    return JSON.stringify({
      canonical_name: "Stripe",
      canonical_domain: "stripe.com",
      one_line_description: "Payments infrastructure for the internet.",
      disambiguation_note: null,
    });
  }
  if (prompt.includes("SNAPSHOT report")) {
    return JSON.stringify({
      summary: "Stripe builds payments infrastructure for the internet.",
      tagline: "Internet payments for developers.",
      business_model: "B2B",
      industry: "Fintech",
      stage: "Public",
      hq: "San Francisco, CA",
      founded_year: 2010,
      employee_count_band: "5001-10000",
      claims: [
        {
          id: 1,
          text: "Stripe was founded in 2010.",
          citation_url: "https://valid.example.com/stripe-history",
          citation_quote: "Stripe, founded in 2010 by the Collison brothers...",
        },
      ],
    });
  }
  if (prompt.includes("MOAT analysis")) {
    // One dead citation in the response — under the founder-intel posture
    // the orchestrator annotates it (citation_status.dead=1) but never
    // retries. Test asserts a single moat call regardless.
    return JSON.stringify({
      moat_types: ["distribution", "switching_costs"],
      moat_summary:
        "Stripe's durable asset is the developer-API surface area built since 2011 plus the integration debt baked into thousands of codebases.",
      compounding_moments: [
        {
          year: 2011,
          what_happened: "Public launch of the seven-line checkout API.",
          why_it_compounded:
            "Set the developer-experience bar globally; every payments doc since gets compared to Stripe's.",
          citation_url: "https://valid.example.com/stripe-launch",
          inferred: false,
        },
        {
          year: 2018,
          what_happened: "Stripe Atlas launches.",
          why_it_compounded:
            "Owns top-of-funnel founders before they have revenue, so the payments default is set by the time they need it.",
          citation_url: null,
          inferred: true,
        },
      ],
      replicability: {
        data_score: 5,
        network_score: 4,
        distribution_score: 8,
        regulatory_score: 6,
        reasoning: {
          data: "Fraud signals across millions of merchants are real but Adyen and PayPal have comparable surfaces.",
          network: "Mostly one-sided — a new user joining doesn't make checkout better for the next.",
          distribution: "Default for indie devs and YC. Brand+integration moat measured in years.",
          regulatory: "State money transmitter licenses across all 50 US states plus EU e-money license.",
        },
        confidence: {
          data: "medium",
          network: "high",
          distribution: "high",
          regulatory: "high",
        },
      },
      defensible:
        "The integration footprint — tens of thousands of codebases have Stripe SDKs wired into checkout, billing, webhooks.",
      overrated: "The 'best docs in fintech' brand is a six-month project for a focused team.",
      attack_vector:
        "Stripe's API-first model means the merchant owns the checkout page — Stripe never sees the buyer. Attack by owning the buyer relationship end-to-end across merchants. Stripe can't follow without alienating the developer audience.",
      claims: [
        {
          id: 1,
          text: "Stripe API launched in 2011.",
          citation_url: "https://valid.example.com/stripe-launch",
          citation_quote: "Today we're launching Stripe.",
          inferred: false,
        },
        {
          id: 2,
          text: "Stripe holds money transmitter licenses across all 50 US states.",
          // Intentionally dead URL: validates that the orchestrator
          // annotates as dead but does not retry.
          citation_url: "https://dead.example.com/missing",
          citation_quote: "Stripe is licensed as a money transmitter...",
          inferred: false,
        },
      ],
    });
  }
  if (prompt.includes("Identify the founders")) {
    return JSON.stringify({
      founders: [
        {
          name: "Patrick Collison",
          role: "CEO",
          photo_url: null,
          linkedin_url: null,
          twitter_url: null,
          personal_site: null,
          github_url: null,
          college: "MIT",
          prior_companies: ["Auctomatic"],
          technical: true,
          what_they_bring: "Technical depth, dev empathy.",
          full_bio: "Founder of Stripe. Earlier sold Auctomatic.",
        },
      ],
      claims: [],
    });
  }
  if (prompt.includes("Research the tech stack")) {
    return JSON.stringify({
      current_stack: { frontend: ["React"], backend: ["Ruby"], database: ["MongoDB"], infra: ["AWS"], vendors: ["Auth0"] },
      mvp_stack: { frontend: ["jQuery"], backend: ["Ruby"], database: ["Postgres"], infra: ["Heroku"], vendors: [] },
      mvp_cost_estimate: {
        team_low_usd: 60000,
        team_high_usd: 120000,
        infra_low_usd: 1000,
        infra_high_usd: 5000,
        other_low_usd: 5000,
        other_high_usd: 15000,
        total_low_usd: 66000,
        total_high_usd: 140000,
        methodology: "2 founders × 6mo × SF salary band.",
      },
      stack_evolution: "Migrated from Heroku to AWS at scale.",
      claims: [],
    });
  }
  if (prompt.includes("funding history")) {
    return JSON.stringify({
      rounds: [
        {
          round_type: "Seed",
          date: "2010-08",
          amount_usd: 2000000,
          valuation_usd: null,
          lead_investors: ["Sequoia"],
          all_investors: ["Sequoia", "YC"],
        },
      ],
      total_raised_usd: 2000000,
      milestones: [{ date: "2011-09", label: "Public launch", kind: "product" }],
      claims: [],
    });
  }
  if (prompt.includes("traction signals")) {
    return JSON.stringify({
      arr_estimate: { low_usd: null, high_usd: null, as_of: null, confidence: "unknown", source: "no reliable public data" },
      headcount_history: [],
      web_traffic_trend: "unknown",
      web_traffic_note: "n/a",
      other_signals: [],
      claims: [],
    });
  }
  if (prompt.includes("market and competitive landscape")) {
    return JSON.stringify({
      tam_usd: 5000000000000,
      sam_usd: 1000000000000,
      som_usd: 100000000000,
      market_size_source: "internal estimate",
      market_size_confidence: "our_estimate",
      pioneer_or_follower: "fast_follower",
      pioneer_reasoning: "Came after Braintree/PayPal but redefined developer ergonomics.",
      competitors: [
        { name: "Adyen", domain: "adyen.com", positioning: "Enterprise-grade." },
        { name: "Braintree", domain: "braintreepayments.com", positioning: "PayPal-owned." },
      ],
      category_growth_rate: "~15% CAGR",
      claims: [],
    });
  }
  return "{}";
}

// vitest globals
declare const afterEach: (fn: () => void) => void;
