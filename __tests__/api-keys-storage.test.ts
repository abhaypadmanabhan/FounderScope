import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  KEY_NAMES,
  migrateLegacyKeys,
  purgeRemovedKeys,
  readAllKeys,
  readKey,
  writeKey,
} from "@/lib/api-keys";

// vitest runs in the `node` environment, so there is no window/localStorage.
// A Map-backed Storage is enough: the module only uses getItem/setItem/
// removeItem/length/key.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear: (): void => {
      store.clear();
    },
    getItem: (k: string): string | null => store.get(k) ?? null,
    key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string): void => {
      store.delete(k);
    },
    setItem: (k: string, v: string): void => {
      store.set(k, v);
    },
  };
}

// `window` is declared non-optional on globalThis by lib.dom, so it is reached
// through an index signature here — that is what makes `delete` legal.
function setWindow(value: { localStorage: Storage } | undefined): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (value === undefined) {
    delete g.window;
  } else {
    g.window = value;
  }
}

let storage: Storage;

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null) out[k] = storage.getItem(k) ?? "";
  }
  return out;
}

beforeEach(() => {
  storage = memoryStorage();
  setWindow({ localStorage: storage });
});

afterEach(() => {
  setWindow(undefined);
});

describe("KEY_NAMES", () => {
  it("is exactly the OpenRouter-era key set", () => {
    expect([...KEY_NAMES]).toEqual([
      "openrouter_api_key",
      "exa_api_key",
      "firecrawl_api_key",
      "tavily_api_key",
    ]);
  });

  it("carries no Anthropic or Kimi key", () => {
    const names: readonly string[] = KEY_NAMES;
    expect(names).not.toContain("anthropic_api_key");
    expect(names).not.toContain("kimi_api_key");
  });
});

describe("readKey / writeKey", () => {
  it("scopes a signed-in user's key under fs:<id>:", () => {
    writeKey("user-1", "openrouter_api_key", "sk-or-v1-abc");
    expect(storage.getItem("fs:user-1:openrouter_api_key")).toBe("sk-or-v1-abc");
    expect(readKey("user-1", "openrouter_api_key")).toBe("sk-or-v1-abc");
  });

  it("keeps two users' keys apart in the same browser", () => {
    writeKey("user-1", "exa_api_key", "exa-one");
    writeKey("user-2", "exa_api_key", "exa-two");
    expect(readKey("user-1", "exa_api_key")).toBe("exa-one");
    expect(readKey("user-2", "exa_api_key")).toBe("exa-two");
  });

  it("falls back to legacy: for signed-out writes", () => {
    writeKey(null, "exa_api_key", "exa-anon");
    expect(storage.getItem("legacy:exa_api_key")).toBe("exa-anon");
  });

  it("removes the entry when written an empty value", () => {
    writeKey("user-1", "tavily_api_key", "tvly-1");
    writeKey("user-1", "tavily_api_key", "");
    expect(readKey("user-1", "tavily_api_key")).toBeNull();
  });
});

describe("readAllKeys", () => {
  it("returns every key name, null when unset, trimmed when set", () => {
    writeKey("user-1", "openrouter_api_key", "sk-or-v1-abc");
    writeKey("user-1", "exa_api_key", "  exa-1  ");
    expect(readAllKeys("user-1")).toEqual({
      openrouter_api_key: "sk-or-v1-abc",
      exa_api_key: "exa-1",
      firecrawl_api_key: null,
      tavily_api_key: null,
    });
  });

  it("treats a whitespace-only stored value as absent", () => {
    writeKey("user-1", "firecrawl_api_key", "   ");
    expect(readAllKeys("user-1").firecrawl_api_key).toBeNull();
  });
});

describe("purgeRemovedKeys", () => {
  it("deletes Anthropic and Kimi entries in every namespace", () => {
    storage.setItem("anthropic_api_key", "sk-ant-bare");
    storage.setItem("legacy:kimi_api_key", "km-legacy");
    storage.setItem("fs:user-1:anthropic_api_key", "sk-ant-1");
    storage.setItem("fs:user-2:kimi_api_key", "km-2");

    purgeRemovedKeys();

    expect(snapshot()).toEqual({});
  });

  it("leaves live keys and unrelated entries alone", () => {
    storage.setItem("fs:user-1:anthropic_api_key", "sk-ant-1");
    storage.setItem("fs:user-1:openrouter_api_key", "sk-or-v1-abc");
    storage.setItem("fs:user-1:exa_api_key", "exa-1");
    storage.setItem("sb-abc-auth-token", "session");

    purgeRemovedKeys();

    expect(snapshot()).toEqual({
      "fs:user-1:openrouter_api_key": "sk-or-v1-abc",
      "fs:user-1:exa_api_key": "exa-1",
      "sb-abc-auth-token": "session",
    });
  });

  it("is idempotent — repeated runs change nothing further", () => {
    storage.setItem("fs:user-1:kimi_api_key", "km-1");
    storage.setItem("fs:user-1:exa_api_key", "exa-1");

    purgeRemovedKeys();
    const afterFirst = snapshot();
    purgeRemovedKeys();
    purgeRemovedKeys();

    expect(snapshot()).toEqual(afterFirst);
    expect(afterFirst).toEqual({ "fs:user-1:exa_api_key": "exa-1" });
  });

  it("is a no-op on a store that never held a removed key", () => {
    storage.setItem("fs:user-1:openrouter_api_key", "sk-or-v1-abc");
    purgeRemovedKeys();
    expect(snapshot()).toEqual({ "fs:user-1:openrouter_api_key": "sk-or-v1-abc" });
  });

  it("still purges after a second user signs into the same browser", () => {
    storage.setItem("fs:user-1:anthropic_api_key", "sk-ant-1");
    purgeRemovedKeys();
    storage.setItem("fs:user-2:kimi_api_key", "km-2");
    purgeRemovedKeys();
    expect(snapshot()).toEqual({});
  });

  it("does not throw when there is no window", () => {
    setWindow(undefined);
    expect(() => purgeRemovedKeys()).not.toThrow();
  });
});

describe("migrateLegacyKeys", () => {
  it("moves both bare and legacy:-prefixed entries into the user scope", () => {
    storage.setItem("openrouter_api_key", "sk-or-v1-bare");
    storage.setItem("legacy:exa_api_key", "exa-anon");

    migrateLegacyKeys("user-1");

    expect(snapshot()).toEqual({
      "fs:user-1:openrouter_api_key": "sk-or-v1-bare",
      "fs:user-1:exa_api_key": "exa-anon",
    });
  });

  it("never overwrites a key already scoped to the user", () => {
    storage.setItem("fs:user-1:exa_api_key", "exa-mine");
    storage.setItem("legacy:exa_api_key", "exa-old");

    migrateLegacyKeys("user-1");

    expect(readKey("user-1", "exa_api_key")).toBe("exa-mine");
    expect(storage.getItem("legacy:exa_api_key")).toBeNull();
  });

  it("does nothing for a signed-out visitor", () => {
    storage.setItem("legacy:exa_api_key", "exa-anon");
    migrateLegacyKeys(null);
    expect(storage.getItem("legacy:exa_api_key")).toBe("exa-anon");
  });
});
