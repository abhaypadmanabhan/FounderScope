import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();
const adminFromMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: vi.fn(), getAll: () => [] }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    auth: { getUser: getUserMock },
    from: (...args: unknown[]) => fromMock(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => adminFromMock(...args),
  },
}));

import { GET, POST } from "@/app/api/search-history/route";

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  adminFromMock.mockReset();
});

describe("GET /api/search-history", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("queries search_history via the auth-cookie client", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          searched_at: "2026-05-11T10:00:00Z",
          companies: { slug: "stripe", display_name: "Stripe" },
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([
      {
        slug: "stripe",
        display_name: "Stripe",
        searched_at: "2026-05-11T10:00:00Z",
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("search_history");
  });
});

describe("POST /api/search-history", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new Request("https://app.test/api/search-history", {
      method: "POST",
      body: JSON.stringify({ slug: "stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("upserts a search_history row with the authenticated user_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: "co1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });

    // companies lookup goes through the admin client now.
    adminFromMock.mockImplementation((table: string) => {
      if (table === "companies") return { select };
      throw new Error(`unexpected admin table ${table}`);
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "search_history") return { upsert };
      throw new Error(`unexpected table ${table}`);
    });

    const req = new Request("https://app.test/api/search-history", {
      method: "POST",
      body: JSON.stringify({ slug: "stripe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row).toMatchObject({ user_id: "u1", company_id: "co1" });
    expect(row.searched_at).toBeTruthy();
    expect(opts).toEqual({ onConflict: "user_id,company_id" });
  });
});
