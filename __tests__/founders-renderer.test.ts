import { describe, it, expect } from "vitest";
import { parseGithubHandle, avatarTiers } from "@/lib/sections/founders";

describe("parseGithubHandle", () => {
  it("extracts handle from canonical https URL", () => {
    expect(parseGithubHandle("https://github.com/torvalds")).toBe("torvalds");
  });

  it("extracts handle from www URL with trailing slash", () => {
    expect(parseGithubHandle("https://www.github.com/sindresorhus/")).toBe(
      "sindresorhus"
    );
  });

  it("ignores nested paths beyond the handle", () => {
    expect(parseGithubHandle("https://github.com/microsoft/typescript")).toBe(
      "microsoft"
    );
  });

  it("rejects reserved non-user paths", () => {
    expect(parseGithubHandle("https://github.com/orgs")).toBeNull();
    expect(parseGithubHandle("https://github.com/marketplace")).toBeNull();
    expect(parseGithubHandle("https://github.com/explore")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(parseGithubHandle(null)).toBeNull();
    expect(parseGithubHandle(undefined)).toBeNull();
  });

  it("returns null for non-github URLs", () => {
    expect(parseGithubHandle("https://gitlab.com/foo")).toBeNull();
    expect(parseGithubHandle("https://example.com/github.com/foo")).toBeNull();
  });

  it("handles query strings and fragments", () => {
    expect(parseGithubHandle("https://github.com/user?tab=overview")).toBe("user");
    expect(parseGithubHandle("https://github.com/user#anchor")).toBe("user");
  });
});

describe("avatarTiers", () => {
  it("photo first, then github", () => {
    const tiers = avatarTiers({
      photo_url: "https://upload.wikimedia.org/foo.jpg",
      github_url: "https://github.com/handle",
    });
    expect(tiers).toEqual([
      { kind: "photo", url: "https://upload.wikimedia.org/foo.jpg" },
      { kind: "github", url: "https://github.com/handle.png?size=200" },
    ]);
  });

  it("github only when photo missing", () => {
    const tiers = avatarTiers({
      photo_url: null,
      github_url: "https://github.com/h",
    });
    expect(tiers).toHaveLength(1);
    expect(tiers[0].kind).toBe("github");
  });

  it("empty array when both missing — caller falls through to initials", () => {
    expect(
      avatarTiers({ photo_url: null, github_url: null })
    ).toEqual([]);
  });

  it("empty array when github_url is a non-user reserved path", () => {
    expect(
      avatarTiers({ photo_url: null, github_url: "https://github.com/explore" })
    ).toEqual([]);
  });
});
