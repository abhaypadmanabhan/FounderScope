// Client-only renderer for the founders section. Lives separately from
// founders.ts so that the section module (schema + buildPrompt + section
// definition) stays server-importable by the orchestrator (route.ts).
"use client";

import React, { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SectionShell } from "@/components/section-shell";
import { CitationSup } from "@/components/citation-sup";
import { padOrder } from "@/lib/sections/format";
import type { Citation, RendererProps } from "./types";
import { avatarTiers, type Founder, type FoundersOutput } from "./founders";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic name → 0..4. Sibling founders sharing initials (e.g. Dario +
// Daniela Amodei → both "DA") still land on different tones because the hash
// folds in the full string, not just the initials.
export function avatarToneIndex(name: string): 0 | 1 | 2 | 3 | 4 {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 5) as 0 | 1 | 2 | 3 | 4;
}

function InitialsAvatar({ name, size }: { name: string; size: number }) {
  const tone = avatarToneIndex(name);
  return (
    <div
      aria-label={name}
      data-avatar-tone={tone}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: `var(--avatar-${tone}-bg)`,
        border: `1px solid var(--avatar-${tone}-border)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-serif)",
        fontWeight: 600,
        fontSize: Math.round(size * 0.46),
        lineHeight: 1,
        color: `var(--avatar-${tone}-fg)`,
        letterSpacing: "-0.01em",
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

function FounderAvatar({ founder, size }: { founder: Founder; size: number }) {
  const tiers = useMemo(
    () => avatarTiers(founder),
    [founder.photo_url, founder.github_url] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [idx, setIdx] = useState(0);
  const current = tiers[idx];

  if (!current) {
    return <InitialsAvatar name={founder.name} size={size} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current.url}
      alt={founder.name}
      width={size}
      height={size}
      onError={() => setIdx((i) => i + 1)}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        objectFit: "cover",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        display: "block",
        flexShrink: 0,
      }}
    />
  );
}

// Inline [n] citation tokens → CitationSup. Unmatched [n] survive as plain
// text — keeps the model honest if it invents a number that isn't in claims.
function renderProseWithCitations(text: string, citations: Citation[]): React.ReactNode {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const id = parseInt(m[1], 10);
      const c = citations.find((x) => x.id === id && x.url);
      if (c) return <CitationSup key={i} citation={c} />;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function technicalLabel(technical: boolean): string {
  return technical ? "technical" : "operating";
}

function RoleLine({
  role,
  technical,
  size = 13,
}: {
  role: string;
  technical: boolean;
  size?: number;
}) {
  return (
    <div
      className="flex items-baseline gap-2"
      style={{ fontSize: size, color: "var(--text-muted)" }}
    >
      <span>{role}</span>
      <span style={{ color: "var(--text-quiet)" }}>·</span>
      <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
        {technicalLabel(technical)}
      </span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="eyebrow"
        style={{ flexShrink: 0, minWidth: 76, color: "var(--text-quiet)" }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text-muted)",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FounderCard({
  founder,
  onClick,
}: {
  founder: Founder;
  onClick: () => void;
}) {
  const hasMeta = founder.college || founder.prior_companies.length > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left w-full block t-200 relative"
      style={{
        padding: "28px 0 30px",
        background: "transparent",
        borderTop: "1px solid var(--border-faint)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderTopColor = "var(--accent-border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderTopColor = "var(--border-faint)";
      }}
    >
      <div className="flex items-start gap-5">
        <FounderAvatar founder={founder} size={56} />
        <div className="flex-1 min-w-0">
          <h3
            className="m-0 t-200"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 24,
              lineHeight: 1.18,
              letterSpacing: "-0.018em",
              color: "var(--text)",
              fontWeight: 400,
              marginBottom: 4,
            }}
          >
            {founder.name}
          </h3>
          <div style={{ marginBottom: hasMeta ? 18 : 16 }}>
            <RoleLine role={founder.role} technical={founder.technical} />
          </div>

          {hasMeta && (
            <div
              className="space-y-2"
              style={{ marginBottom: 18 }}
            >
              {founder.college && (
                <MetaRow label="Education" value={founder.college} />
              )}
              {founder.prior_companies.length > 0 && (
                <MetaRow
                  label="Previously"
                  value={founder.prior_companies.join(", ")}
                />
              )}
            </div>
          )}

          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--text)",
              margin: 0,
              paddingLeft: 12,
              borderLeft: "2px solid var(--accent-border)",
            }}
          >
            {founder.what_they_bring}
          </p>
        </div>
      </div>
    </button>
  );
}

interface SheetLink {
  label: string;
  hint: string;
  url: string;
}

// Render the URL host as a quiet hint after the label so users see WHERE
// the link goes without leaving the surface.
function hostHint(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildSheetLinks(f: Founder): SheetLink[] {
  const out: SheetLink[] = [];
  if (f.linkedin_url) out.push({ label: "LinkedIn", hint: hostHint(f.linkedin_url), url: f.linkedin_url });
  if (f.github_url) out.push({ label: "GitHub", hint: hostHint(f.github_url), url: f.github_url });
  if (f.twitter_url) out.push({ label: "Twitter", hint: hostHint(f.twitter_url), url: f.twitter_url });
  if (f.personal_site) out.push({ label: "Site", hint: hostHint(f.personal_site), url: f.personal_site });
  return out;
}

function SheetBlock({
  eyebrow,
  children,
  divider = true,
}: {
  eyebrow: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <section
      style={{
        borderTop: divider ? "1px solid var(--border-faint)" : "none",
        paddingTop: divider ? 22 : 0,
        marginBottom: 28,
      }}
    >
      <div
        className="eyebrow"
        style={{ marginBottom: 12, color: "var(--text-quiet)" }}
      >
        {eyebrow}
      </div>
      {children}
    </section>
  );
}

function FounderSheetBody({
  founder,
  citations,
}: {
  founder: Founder;
  citations: Citation[];
}) {
  const links = buildSheetLinks(founder);
  const hasMeta = founder.college || founder.prior_companies.length > 0;

  return (
    <div
      className="overflow-y-auto h-full"
      style={{ padding: "44px 36px 56px" }}
    >
      {/* Header — generous header band with serif headline */}
      <header style={{ marginBottom: 36 }}>
        <FounderAvatar founder={founder} size={88} />
        <SheetTitle
          className="m-0"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
            fontSize: 38,
            lineHeight: 1.05,
            letterSpacing: "-0.022em",
            color: "var(--text)",
            marginTop: 22,
            marginBottom: 8,
          }}
        >
          {founder.name}
        </SheetTitle>
        <RoleLine role={founder.role} technical={founder.technical} size={14} />
      </header>

      {/* Bring — opens with the editorial pull-quote, no divider above */}
      <SheetBlock eyebrow="What they bring" divider={false}>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 18,
            lineHeight: 1.55,
            color: "var(--text)",
            margin: 0,
            paddingLeft: 16,
            borderLeft: "2px solid var(--accent-border)",
          }}
        >
          {founder.what_they_bring}
        </p>
      </SheetBlock>

      {/* Bio — serif body, the centrepiece */}
      <SheetBlock eyebrow="Bio">
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 17,
            lineHeight: 1.68,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {renderProseWithCitations(founder.full_bio, citations)}
        </p>
      </SheetBlock>

      {/* Meta — same MetaRow rhythm as the card */}
      {hasMeta && (
        <SheetBlock eyebrow="Background">
          <div className="space-y-3">
            {founder.college && (
              <MetaRow label="Education" value={founder.college} />
            )}
            {founder.prior_companies.length > 0 && (
              <MetaRow
                label="Previously"
                value={founder.prior_companies.join(", ")}
              />
            )}
          </div>
        </SheetBlock>
      )}

      {/* Links — eyebrow label · mono host */}
      {links.length > 0 && (
        <SheetBlock eyebrow="Links">
          <ul className="m-0 p-0 list-none">
            {links.map(({ label, hint, url }, i) => (
              <li
                key={label}
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--border-faint)",
                }}
              >
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-baseline justify-between t-200"
                  style={{
                    padding: "11px 0",
                    fontSize: 14,
                    color: "var(--text)",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--accent-color)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text)";
                  }}
                >
                  <span>{label}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-faint)",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.01em",
                      marginLeft: 12,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hint}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </SheetBlock>
      )}
    </div>
  );
}

export const FoundersRenderer: React.FC<RendererProps<FoundersOutput>> = ({
  data,
  citations,
  section,
}) => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const selected = openIdx !== null ? data.founders[openIdx] : null;

  return (
    <SectionShell eyebrow={section.title} n={padOrder(section.order)} width="wide">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-14">
        {data.founders.map((f, i) => (
          <FounderCard
            key={`${f.name}-${i}`}
            founder={f}
            onClick={() => setOpenIdx(i)}
          />
        ))}
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(v) => {
          if (!v) setOpenIdx(null);
        }}
      >
        <SheetContent
          side="right"
          className="!max-w-none p-0"
          style={{
            background: "var(--bg)",
            borderLeft: "1px solid var(--border-color)",
            width: "min(480px, 100vw)",
          }}
        >
          {selected && (
            <FounderSheetBody founder={selected} citations={citations} />
          )}
        </SheetContent>
      </Sheet>
    </SectionShell>
  );
};

export const FoundersSkeletonRenderer: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-14">
    {[0, 1].map((i) => (
      <div
        key={i}
        style={{
          padding: "28px 0 30px",
          borderTop: "1px solid var(--border-faint)",
        }}
      >
        <div className="flex items-start gap-5">
          <Skeleton className="rounded-full" style={{ width: 56, height: 56 }} />
          <div className="flex-1 space-y-3 min-w-0">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <div className="pt-2 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-4 w-5/6 mt-3" />
          </div>
        </div>
      </div>
    ))}
  </div>
);
