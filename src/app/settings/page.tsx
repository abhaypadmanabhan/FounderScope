// Settings — Anthropic API key (BYOK). Stored client-side in localStorage,
// sent as x-anthropic-key header from src/app/company/[slug]/page.tsx on fresh research.
"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "anthropic_api_key";

export default function SettingsPage() {
  const [stored, setStored] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const v = window.localStorage.getItem(STORAGE_KEY);
    setStored(v);
    setDraft(v ?? "");
    setHydrated(true);
  }, []);

  const dirty = hydrated && draft.trim() !== (stored ?? "");
  const valid = draft.trim().startsWith("sk-ant-") && draft.trim().length > 20;

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setStored(trimmed);
    toast.success("API key saved");
  };

  const handleClear = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setStored(null);
    setDraft("");
    toast.success("API key cleared");
  };

  return (
    <main className="mx-auto max-w-xl px-8 py-14">
      <header className="mb-10">
        <div className="eyebrow mb-2">Settings</div>
        <h1
          className="font-serif"
          style={{ fontSize: 34, lineHeight: 1.1, color: "var(--text)" }}
        >
          Your Anthropic key
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Stored only in this browser. Sent with each fresh research request.
          Never transmitted to FounderScope servers.
        </p>
      </header>

      <section className="space-y-3">
        <label
          htmlFor="anthropic-key"
          className="block text-xs"
          style={{ color: "var(--text-faint)", letterSpacing: "0.04em" }}
        >
          API KEY
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id="anthropic-key"
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="pr-9 font-mono text-xs"
              aria-invalid={draft.length > 0 && !valid ? true : undefined}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide key" : "Show key"}
              className="absolute inset-y-0 right-2 flex items-center"
              style={{ color: "var(--text-faint)" }}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <Button
            onClick={handleSave}
            disabled={!dirty || !valid}
            size="sm"
          >
            Save
          </Button>
          {stored && (
            <Button
              onClick={handleClear}
              variant="outline"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>

        {draft.length > 0 && !valid && (
          <p className="text-xs" style={{ color: "hsl(var(--destructive))" }}>
            Anthropic keys start with <code className="font-mono">sk-ant-</code>.
          </p>
        )}

        <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
          {stored ? "A key is saved on this device." : "No key saved on this device."}{" "}
          Cached reports load without one.
        </p>

        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
          style={{ color: "var(--text-faint)" }}
        >
          Get a key from console.anthropic.com
          <ExternalLink size={11} />
        </a>
      </section>
    </main>
  );
}
