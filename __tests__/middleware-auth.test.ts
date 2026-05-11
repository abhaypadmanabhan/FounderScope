import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @supabase/ssr to control `getUser()` behavior.
const getUserMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

// Stub next/server's NextResponse + NextRequest with a minimal shape.
class FakeHeaders {
  private m = new Map<string, string>();
  get(k: string) {
    return this.m.get(k.toLowerCase()) ?? null;
  }
  set(k: string, v: string) {
    this.m.set(k.toLowerCase(), v);
  }
}
class FakeResponse {
  status: number;
  headers = new FakeHeaders();
  cookies = { set: vi.fn(), getAll: () => [] };
  constructor(status = 200) {
    this.status = status;
  }
}
vi.mock("next/server", () => ({
  NextResponse: {
    next: () => new FakeResponse(200),
    redirect: (url: URL) => {
      const r = new FakeResponse(307);
      r.headers.set("location", url.toString());
      return r;
    },
  },
}));

import { middleware, config } from "@/middleware";

function makeRequest(pathname: string, search = ""): unknown {
  const url = new URL(`https://app.test${pathname}${search}`);
  return {
    nextUrl: url,
    url: url.toString(),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  };
}

beforeEach(() => {
  getUserMock.mockReset();
});

describe("middleware auth gate", () => {
  it("redirects unauthenticated users on protected paths to /login?next=<path>", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = (await middleware(
      makeRequest("/company/stripe") as never,
    )) as unknown as FakeResponse;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/login?next=%2Fcompany%2Fstripe",
    );
  });

  it("omits the next param when redirecting from the root", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = (await middleware(
      makeRequest("/") as never,
    )) as unknown as FakeResponse;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/login");
  });

  it("lets authenticated users through", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.c" } },
    });
    const res = (await middleware(
      makeRequest("/company/stripe") as never,
    )) as unknown as FakeResponse;
    expect(res.status).toBe(200);
  });
});

describe("middleware matcher", () => {
  it("excludes /login, /auth, static files, and /_next from matching", () => {
    const matcher = (config as { matcher: string | string[] }).matcher;
    const m = Array.isArray(matcher) ? matcher.join("\n") : matcher;
    expect(m).toMatch(/login/);
    expect(m).toMatch(/auth/);
    expect(m).toMatch(/_next/);
  });
});
