"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getCurrentUserId,
  keyReadiness,
  migrateLegacyKeys,
  purgeRemovedKeys,
  readAllKeys,
  writeKey,
  KEY_NAMES,
  type KeyBundle,
  type KeyName,
} from "@/lib/api-keys";

interface FieldDef {
  storageKey: KeyName;
  label: string;
  placeholder: string;
  href: string;
  required: boolean;
  hint: string;
  validate: (v: string) => boolean;
}

interface GroupDef {
  id: string;
  title: string;
  note: string;
  fields: readonly FieldDef[];
}

// Only OpenRouter's prefix is checked. The search backends are third parties
// whose key formats can drift, and a stale prefix rule here would lock a user
// out of saving a perfectly good key.
const GROUPS: readonly GroupDef[] = [
  {
    id: "inference",
    title: "Inference",
    note: "Every model call routes through OpenRouter — one key, one bill.",
    fields: [
      {
        storageKey: "openrouter_api_key",
        label: "OpenRouter API key",
        placeholder: "sk-or-v1-…",
        href: "https://openrouter.ai/keys",
        required: true,
        hint: "Roughly $0.14 of credit per research run.",
        validate: (v: string) => v.startsWith("sk-or-") && v.length > 20,
      },
    ],
  },
  {
    id: "search",
    title: "Web search",
    note: "Required. No model in the map can search the web on its own, so without a search key every report would be ungrounded.",
    fields: [
      {
        storageKey: "exa_api_key",
        label: "EXA API key",
        placeholder: "Exa key…",
        href: "https://dashboard.exa.ai",
        required: true,
        hint: "Default backend. Used unless you leave it blank.",
        validate: (v: string) => v.length > 10,
      },
      {
        storageKey: "firecrawl_api_key",
        label: "Firecrawl API key",
        placeholder: "fc-…",
        href: "https://www.firecrawl.dev/app/api-keys",
        required: false,
        hint: "Swap-in. Used only when EXA is blank.",
        validate: (v: string) => v.length > 10,
      },
      {
        storageKey: "tavily_api_key",
        label: "Tavily API key",
        placeholder: "tvly-…",
        href: "https://app.tavily.com/home",
        required: false,
        hint: "Swap-in. Used only when EXA and Firecrawl are blank.",
        validate: (v: string) => v.length > 10,
      },
    ],
  },
];

const SEARCH_PROVIDER_LABEL: Record<string, string> = {
  exa: "EXA",
  firecrawl: "Firecrawl",
  tavily: "Tavily",
};

function emptyBundle(): KeyBundle {
  const bundle = {} as KeyBundle;
  for (const name of KEY_NAMES) bundle[name] = null;
  return bundle;
}

function readinessLabel(keys: KeyBundle): string {
  const readiness = keyReadiness(keys);
  if (readiness.ok && readiness.searchProvider) {
    return `Ready — OpenRouter + ${SEARCH_PROVIDER_LABEL[readiness.searchProvider]}`;
  }
  const wanted = readiness.missing.map((m) =>
    m === "openrouter" ? "an OpenRouter key" : "a search key",
  );
  return `Not configured — add ${wanted.join(" and ")}.`;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyBundle>(emptyBundle);
  const [userId, setUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserId();
      migrateLegacyKeys(id);
      purgeRemovedKeys();
      setUserId(id);
      setKeys(readAllKeys(id));
      setHydrated(true);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-xl px-8 py-14">
      <header className="mb-12">
        <div className="eyebrow mb-2">Settings</div>
        <h1
          className="font-serif"
          style={{ fontSize: 34, lineHeight: 1.1, color: "var(--text)" }}
        >
          API keys
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-faint)" }}>
          Stored only in this browser. Sent with each fresh research request.
          Never transmitted to FounderScope servers.
        </p>
      </header>

      <div className="space-y-12">
        {GROUPS.map((group) => (
          <section key={group.id}>
            <div
              className="mb-1 border-t pt-5"
              style={{ borderColor: "var(--border-faint)" }}
            >
              <div className="eyebrow">{group.title}</div>
            </div>
            <p
              className="mb-7 text-sm"
              style={{ color: "var(--text-faint)", maxWidth: "44ch" }}
            >
              {group.note}
            </p>

            <div className="space-y-8">
              {group.fields.map((field) => (
                <KeyField
                  key={field.storageKey}
                  field={field}
                  ready={hydrated}
                  value={keys[field.storageKey] ?? ""}
                  onChange={(v) =>
                    setKeys((s) => ({ ...s, [field.storageKey]: v }))
                  }
                  onSave={(v) => {
                    writeKey(userId, field.storageKey, v);
                    setKeys((s) => ({ ...s, [field.storageKey]: v }));
                    toast.success(`${field.label} saved`);
                  }}
                  onClear={() => {
                    writeKey(userId, field.storageKey, "");
                    setKeys((s) => ({ ...s, [field.storageKey]: null }));
                    toast.success(`${field.label} cleared`);
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {hydrated && (
        <p className="mt-12 text-xs" style={{ color: "var(--text-quiet)" }}>
          {readinessLabel(keys)}
        </p>
      )}
    </main>
  );
}

function KeyField({
  field,
  ready,
  value,
  onChange,
  onSave,
  onClear,
}: {
  field: FieldDef;
  /**
   * False until the auth round trip that fills `userId` has resolved. Saving
   * before then writes to the shared signed-out `legacy:` namespace rather than
   * `fs:<user-id>:`, and the next account to sign in on this browser adopts the
   * key on migration.
   */
  ready: boolean;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  onClear: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const trimmed = value.trim();
  const valid = trimmed.length === 0 || field.validate(trimmed);
  const dirty = trimmed.length > 0; // simplification: "save if input has content"

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <label
          htmlFor={field.storageKey}
          className="block text-xs"
          style={{ color: "var(--text-faint)", letterSpacing: "0.04em" }}
        >
          {field.label.toUpperCase()}
        </label>
        <span className="text-xs" style={{ color: "var(--text-quiet)" }}>
          {field.required ? "Required" : "Optional"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={field.storageKey}
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pr-9 font-mono text-xs"
            aria-invalid={value.length > 0 && !valid ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide key" : "Show key"}
            className="absolute inset-y-0 right-2 flex items-center"
            style={{ color: "var(--text-faint)" }}
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <Button
          onClick={() => onSave(trimmed)}
          disabled={!ready || !dirty || !valid}
          size="sm"
        >
          Save
        </Button>
        <Button onClick={onClear} variant="outline" size="sm">
          Clear
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <a
          href={field.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
          style={{ color: "var(--text-faint)" }}
        >
          Get a key →
          <ExternalLink size={11} />
        </a>
        <span className="text-xs" style={{ color: "var(--text-quiet)" }}>
          {field.hint}
        </span>
      </div>
    </div>
  );
}
