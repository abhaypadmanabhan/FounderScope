// Per-user, localStorage-scoped API key storage. Without scoping, user A's
// keys would be visible to user B sharing the same browser — localStorage
// is per-origin, not per-Supabase-user.
//
// Layout: `fs:${userId}:${name}` for signed-in users, `legacy:${name}` as
// a fallback (should rarely apply once migrateLegacyKeys has run once).
//
// Inference is OpenRouter-only. Search is required, not optional: no model in
// the map has a native web-search tool, so a report without a search key would
// be ungrounded.

import { supabaseBrowser } from "@/lib/supabase/browser";

export const KEY_NAMES = [
  "openrouter_api_key",
  "exa_api_key",
  "firecrawl_api_key",
  "tavily_api_key",
] as const;

export type KeyName = (typeof KEY_NAMES)[number];

export type KeyBundle = Record<KeyName, string | null>;

// Search backends, in preference order. EXA is the default; the other two are
// swap-ins for users who already pay for them.
export const SEARCH_PROVIDER_IDS = ["exa", "firecrawl", "tavily"] as const;

export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export const SEARCH_KEY_BY_PROVIDER: Record<SearchProviderId, KeyName> = {
  exa: "exa_api_key",
  firecrawl: "firecrawl_api_key",
  tavily: "tavily_api_key",
};

// Keys the app used to ask for. Both providers are gone; leaving these behind
// would strand a returning user with dead credentials they cannot see.
const REMOVED_KEY_NAMES = ["anthropic_api_key", "kimi_api_key"] as const;

function scoped(userId: string | null, name: KeyName): string {
  return userId ? `fs:${userId}:${name}` : `legacy:${name}`;
}

function nonEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const { data } = await supabaseBrowser().auth.getUser();
  return data.user?.id ?? null;
}

export function readKey(
  userId: string | null,
  name: KeyName,
): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(scoped(userId, name));
}

export function writeKey(
  userId: string | null,
  name: KeyName,
  value: string,
): void {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(scoped(userId, name));
  } else {
    window.localStorage.setItem(scoped(userId, name), value);
  }
}

export function readAllKeys(userId: string | null): KeyBundle {
  const bundle = {} as KeyBundle;
  for (const name of KEY_NAMES) {
    bundle[name] = nonEmpty(readKey(userId, name));
  }
  return bundle;
}

// One-time migration: if un-scoped legacy keys exist, move them to the
// current user's namespace. Run on first authenticated load. Both the bare
// name and the `legacy:` prefix are checked — signed-out writes land under
// `legacy:`, un-scoped writes predate that prefix entirely.
export function migrateLegacyKeys(userId: string | null): void {
  if (typeof window === "undefined" || !userId) return;
  for (const name of KEY_NAMES) {
    const target = scoped(userId, name);
    for (const source of [name, `legacy:${name}`]) {
      const legacyValue = window.localStorage.getItem(source);
      if (!legacyValue) continue;
      if (!window.localStorage.getItem(target)) {
        window.localStorage.setItem(target, legacyValue);
      }
      window.localStorage.removeItem(source);
    }
  }
}

// Deletes every stored Anthropic/Kimi key, whatever namespace it landed in —
// bare, `legacy:`-prefixed, or scoped to any user id. Idempotent by
// construction: removing an absent entry is a no-op, so this is safe on every
// load. Deliberately not gated behind a "purged" marker — a marker would skip
// the cleanup for a second user signing into the same browser.
export function purgeRemovedKeys(): void {
  if (typeof window === "undefined") return;
  const storage = window.localStorage;
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const storageKey = storage.key(i);
    if (storageKey === null) continue;
    const name = storageKey.slice(storageKey.lastIndexOf(":") + 1);
    if ((REMOVED_KEY_NAMES as readonly string[]).includes(name)) {
      doomed.push(storageKey);
    }
  }
  // Collected first: removing during iteration reindexes the store.
  for (const storageKey of doomed) storage.removeItem(storageKey);
}

// First search key present, in preference order. Users who paste more than one
// get EXA, the backend whose cache/budget/retry behavior is best exercised.
export function selectSearchKey(
  keys: KeyBundle,
): { provider: SearchProviderId; key: string } | null {
  for (const provider of SEARCH_PROVIDER_IDS) {
    const key = nonEmpty(keys[SEARCH_KEY_BY_PROVIDER[provider]]);
    if (key) return { provider, key };
  }
  return null;
}

export interface KeyReadiness {
  ok: boolean;
  missing: ("openrouter" | "search")[];
  searchProvider: SearchProviderId | null;
}

export function keyReadiness(keys: KeyBundle): KeyReadiness {
  const search = selectSearchKey(keys);
  const missing: ("openrouter" | "search")[] = [];
  if (!nonEmpty(keys.openrouter_api_key)) missing.push("openrouter");
  if (!search) missing.push("search");
  return {
    ok: missing.length === 0,
    missing,
    searchProvider: search?.provider ?? null,
  };
}

// Wire format for /api/research. EXA is the server-side default, so it sends
// no provider header; the swap-ins name themselves.
export function buildKeyHeaders(keys: KeyBundle): Record<string, string> {
  const headers: Record<string, string> = {};
  const openrouter = nonEmpty(keys.openrouter_api_key);
  if (openrouter) headers["x-openrouter-key"] = openrouter;

  const search = selectSearchKey(keys);
  if (search) {
    headers["x-search-key"] = search.key;
    if (search.provider !== "exa") headers["x-search-provider"] = search.provider;
  }
  return headers;
}
