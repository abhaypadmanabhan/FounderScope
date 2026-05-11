"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectProvider } from "@/lib/llm";
import {
  getCurrentUserId,
  migrateLegacyKeys,
  readKey,
  writeKey,
  type KeyName,
} from "@/lib/api-keys";

const FIELDS = [
  {
    storageKey: "anthropic_api_key",
    label: "Anthropic API key",
    placeholder: "sk-ant-…",
    href: "https://console.anthropic.com/settings/keys",
    validate: (v: string) => v.startsWith("sk-ant-") && v.length > 20,
  },
  {
    storageKey: "kimi_api_key",
    label: "Kimi API key",
    placeholder: "sk-…",
    href: "https://platform.moonshot.ai/console/api-keys",
    validate: (v: string) => v.length > 10,
  },
  {
    storageKey: "exa_api_key",
    label: "EXA API key",
    placeholder: "Exa key…",
    href: "https://dashboard.exa.ai",
    validate: (v: string) => v.length > 10,
  },
] as const;

export default function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserId();
      migrateLegacyKeys(id);
      const loaded: Record<string, string> = {};
      for (const f of FIELDS) {
        loaded[f.storageKey] = readKey(id, f.storageKey as KeyName) ?? "";
      }
      setUserId(id);
      setKeys(loaded);
      setHydrated(true);
    })();
  }, []);

  const routing = hydrated
    ? selectProvider({
        anthropic: keys["anthropic_api_key"] || null,
        kimi: keys["kimi_api_key"] || null,
        exa: keys["exa_api_key"] || null,
      })
    : null;

  return (
    <main className="mx-auto max-w-xl px-8 py-14">
      <header className="mb-10">
        <div className="eyebrow mb-2">Settings</div>
        <h1
          className="font-serif"
          style={{ fontSize: 34, lineHeight: 1.1, color: "var(--text)" }}
        >
          API keys
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Stored only in this browser. Sent with each fresh research request.
          Never transmitted to FounderScope servers.
        </p>
      </header>

      <section className="space-y-8">
        {FIELDS.map((f) => (
          <KeyField
            key={f.storageKey}
            field={f}
            value={keys[f.storageKey] ?? ""}
            onChange={(v) => setKeys((s) => ({ ...s, [f.storageKey]: v }))}
            onSave={(v) => {
              writeKey(userId, f.storageKey as KeyName, v);
              toast.success(`${f.label} saved`);
            }}
            onClear={() => {
              writeKey(userId, f.storageKey as KeyName, "");
              setKeys((s) => ({ ...s, [f.storageKey]: "" }));
              toast.success(`${f.label} cleared`);
            }}
          />
        ))}
      </section>

      {hydrated && routing && (
        <p
          className="mt-10 text-xs"
          style={{ color: "var(--text-quiet)" }}
        >
          {routing.ok
            ? `Active: ${routing.config.provider} + ${routing.config.searchBackend === "exa" ? "EXA" : "native search"}`
            : `Not configured: ${routing.message}`}
        </p>
      )}
    </main>
  );
}

interface FieldDef {
  storageKey: string;
  label: string;
  placeholder: string;
  href: string;
  validate: (v: string) => boolean;
}

function KeyField({
  field,
  value,
  onChange,
  onSave,
  onClear,
}: {
  field: FieldDef;
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
      <label
        htmlFor={field.storageKey}
        className="block text-xs mb-2"
        style={{ color: "var(--text-faint)", letterSpacing: "0.04em" }}
      >
        {field.label.toUpperCase()}
      </label>
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
          disabled={!dirty || !valid}
          size="sm"
        >
          Save
        </Button>
        <Button onClick={onClear} variant="outline" size="sm">
          Clear
        </Button>
      </div>
      <a
        href={field.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
        style={{ color: "var(--text-faint)" }}
      >
        Get a key →
        <ExternalLink size={11} />
      </a>
    </div>
  );
}
