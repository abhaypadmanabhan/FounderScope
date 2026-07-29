// Home — centered editorial hero with search trigger + example pills.
"use client";
import Link from "next/link";
import { Search } from "lucide-react";
import { useSearchPalette } from "@/components/search-palette-provider";
import { slugify } from "@/lib/slug";

const EXAMPLES = ["Stripe", "Anthropic", "Figma", "Notion", "Cursor"];

export default function HomePage() {
  const { openPalette } = useSearchPalette();

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center px-8"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-[620px] -mt-16">
        <div
          className="eyebrow mb-6"
          style={{ color: "var(--accent-color)" }}
        >
          FounderScope · v0.4
        </div>

        <h1 className="h-display mb-[18px]" style={{ color: "var(--text)" }}>
          Research any company,
          <br />
          <span
            className="italic"
            style={{ color: "var(--text-muted)" }}
          >
            through a founder&rsquo;s eyes.
          </span>
        </h1>

        <p
          className="lead mb-9 max-w-[520px]"
          style={{ color: "var(--text-muted)" }}
        >
          Moat, founders, funding, traction, market — every claim cited, every
          chart honest about what it knows. Built for technical founders
          deciding what to build next.
        </p>

        {/* Search trigger */}
        <button
          onClick={() => openPalette()}
          className="t-200 w-full flex items-center gap-3 px-5 py-4 rounded-[10px] cursor-text text-left"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-faint)",
            fontSize: 16,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-strong)";
          }}
        >
          <Search size={18} />
          <span className="flex-1">Research a company…</span>
          <span
            className="font-mono px-1.5 py-0.5 rounded"
            style={{
              fontSize: 11,
              border: "1px solid var(--border-color)",
              color: "var(--text-quiet)",
            }}
          >
            ⌘K
          </span>
        </button>

        {/* Examples */}
        <div className="flex items-center gap-2.5 mt-6 flex-wrap">
          <span
            className="small"
            style={{ color: "var(--text-faint)", fontSize: 12 }}
          >
            Try:
          </span>
          {EXAMPLES.map((name) => (
            <Link
              key={name}
              href={`/company/${slugify(name)}`}
              className="t-200 px-3 py-1 rounded-full"
              style={{
                fontSize: 13,
                border: "1px solid var(--border-color)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-border)";
                e.currentTarget.style.color = "var(--accent-color)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              {name}
            </Link>
          ))}
        </div>
      </div>

      <div
        className="absolute bottom-6 flex gap-4 text-[11px]"
        style={{ color: "var(--text-quiet)" }}
      >
        <span>Open source · MIT</span>
        <span>·</span>
        <span>Bring your own OpenRouter API key</span>
        <span>·</span>
        <span>Cache shared across all users</span>
      </div>
    </main>
  );
}
