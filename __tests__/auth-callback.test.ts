import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: exchangeMock },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined,
    set: vi.fn(),
    getAll: () => [],
  }),
}));

import { GET } from "@/app/auth/callback/route";

function makeReq(url: string) {
  return new Request(url);
}

beforeEach(() => {
  exchangeMock.mockReset();
});

describe("/auth/callback", () => {
  it("redirects to /login?error=auth_error when no code is present", async () => {
    const res = await GET(makeReq("https://app.test/auth/callback"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/login?error=auth_error",
    );
  });

  it("exchanges code and redirects to next on success", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    const res = await GET(
      makeReq(
        "https://app.test/auth/callback?code=abc&next=%2Fcompany%2Fstripe",
      ),
    );
    expect(exchangeMock).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/company/stripe",
    );
  });

  it("redirects to / when next is missing", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    const res = await GET(makeReq("https://app.test/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe("https://app.test/");
  });

  it("redirects to /login?error=link_invalid on exchange failure", async () => {
    exchangeMock.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(makeReq("https://app.test/auth/callback?code=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/login?error=link_invalid",
    );
  });
});
