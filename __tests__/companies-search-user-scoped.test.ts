import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const adminFromMock = vi.fn();

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
    from: (...args: unknown[]) => adminFromMock(...args),
  },
}));

import { GET } from "@/app/api/companies/search/route";

beforeEach(() => {
  getUserMock.mockReset();
  adminFromMock.mockReset();
});

describe("GET /api/companies/search", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      new Request("https://app.test/api/companies/search?q=stri"),
    );
    expect(res.status).toBe(401);
  });

  it("returns [] for queries shorter than 2 chars", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(
      new Request("https://app.test/api/companies/search?q=s"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("queries the companies table directly (not joined through search_history)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });

    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          slug: "stripe",
          display_name: "Stripe",
          domain: "stripe.com",
          logo_url: null,
          last_refreshed_at: null,
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const or = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ or });
    adminFromMock.mockReturnValue({ select });

    const res = await GET(
      new Request("https://app.test/api/companies/search?q=stri"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      {
        slug: "stripe",
        display_name: "Stripe",
        domain: "stripe.com",
        logo_url: null,
        last_refreshed_at: null,
      },
    ]);
    expect(adminFromMock).toHaveBeenCalledWith("companies");
  });
});
