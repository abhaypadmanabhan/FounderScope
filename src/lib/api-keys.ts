// Per-user, localStorage-scoped API key storage. Without scoping, user A's
// keys would be visible to user B sharing the same browser — localStorage
// is per-origin, not per-Supabase-user.
//
// Layout: `fs:${userId}:${name}` for signed-in users, `legacy:${name}` as
// a fallback (should rarely apply once migrateLegacyKeys has run once).

import { supabaseBrowser } from "@/lib/supabase/browser";

export const KEY_NAMES = [
  "anthropic_api_key",
  "kimi_api_key",
  "exa_api_key",
] as const;

export type KeyName = (typeof KEY_NAMES)[number];

function scoped(userId: string | null, name: KeyName): string {
  return userId ? `fs:${userId}:${name}` : `legacy:${name}`;
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

// One-time migration: if un-scoped legacy keys exist, move them to the
// current user's namespace. Run on first authenticated load.
export function migrateLegacyKeys(userId: string | null): void {
  if (typeof window === "undefined" || !userId) return;
  for (const name of KEY_NAMES) {
    const legacyValue = window.localStorage.getItem(name);
    if (legacyValue && !window.localStorage.getItem(scoped(userId, name))) {
      window.localStorage.setItem(scoped(userId, name), legacyValue);
    }
    if (legacyValue) {
      window.localStorage.removeItem(name);
    }
  }
}
