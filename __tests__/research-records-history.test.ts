import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: vi.fn(), getAll: () => [] }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "search_history") return { upsert: upsertMock };
      throw new Error(`unexpected admin table ${table}`);
    },
  },
}));

// Mock heavy deps so the route POST doesn't actually run sections.
vi.mock("@/lib/companies", () => ({
  findOrCreateCompany: vi.fn().mockResolvedValue({
    id: "co1",
    slug: "stripe",
    display_name: "Stripe",
    domain: "stripe.com",
    logo_url: null,
  }),
  touchLastRefreshed: vi.fn().mockResolvedValue(undefined),
  updateCompanyCanonical: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/disambiguate", () => ({
  disambiguateCompany: vi.fn().mockResolvedValue({
    canonical_name: "Stripe",
    canonical_domain: "stripe.com",
    one_line_description: "Payments.",
    disambiguation_note: null,
  }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    selectProvider: () => ({
      ok: true,
      config: { provider: "anthropic", searchBackend: "anthropic" },
    }),
    runResearchCall: vi
      .fn()
      .mockResolvedValue({ data: { claims: [] }, modelVersion: "test", usage: null }),
  };
});

vi.mock("@/lib/sections/registry", () => ({ SECTIONS: [] }));

import { POST } from "@/app/api/research/route";

beforeEach(() => {
  getUserMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ error: null });
});

async function drain(res: Response) {
  const reader = res.body!.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

describe("POST /api/research auth + history", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new Request("https://app.test/api/research", {
      method: "POST",
      body: JSON.stringify({ name: "Stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts search_history after disambiguation when authenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = new Request("https://app.test/api/research", {
      method: "POST",
      headers: { "x-openrouter-key": "sk-or-v1-k", "x-search-key": "exa-k" },
      body: JSON.stringify({ name: "Stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drain(res);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toMatchObject({ user_id: "u1", company_id: "co1" });
    expect(opts).toEqual({ onConflict: "user_id,company_id" });
  });
});
