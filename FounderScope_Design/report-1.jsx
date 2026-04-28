// FounderScope — Report sections (Snapshot, Moat, Founders, Funding, Traction, Market)

const { useState: rS, useMemo: rM, useEffect: rE } = React;

function Citation({ n, citations, citeStyle }) {
  const [open, setOpen] = rS(false);
  const c = citations.find(x => x.n === n);
  if (!c) return null;
  const wrapClass = citeStyle === "bracket" ? "cite-bracket" : citeStyle === "margin" ? "cite-margin" : "";
  return (
    <span className={wrapClass} style={{ position: "relative", display: "inline" }}>
      <sup className="cite"
           onMouseEnter={() => setOpen(true)}
           onMouseLeave={() => setOpen(false)}
           onClick={() => window.open(c.url, "_blank")}>
        {n}
      </sup>
      {open && (
        <span style={{
          position: "absolute", left: "50%", bottom: "calc(100% + 6px)",
          transform: "translateX(-50%)", zIndex: 30,
          width: 280, background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)", borderRadius: 8,
          padding: 12, fontSize: 12, lineHeight: 1.5, color: "var(--text)",
          boxShadow: "var(--shadow-pop)", textAlign: "left",
          fontFamily: "var(--font-sans)", letterSpacing: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "var(--accent)", fontWeight: 500, fontSize: 11 }}>[{n}] {c.source}</span>
            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{c.date}</span>
          </div>
          <div className="serif" style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
            "{c.quote}"
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: 11, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.url.replace(/^https?:\/\//, "")}
          </div>
        </span>
      )}
    </span>
  );
}

// — Section header
function SectionHeader({ eyebrow, n }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-quiet)",
        letterSpacing: "0.04em",
      }}>{n}</span>
      <span className="eyebrow" style={{ flex: 1 }}>{eyebrow}</span>
      <span style={{ height: 1, background: "var(--border-faint)", flex: 1 }} />
    </div>
  );
}

// ─── 1. SNAPSHOT
function Snapshot({ data, citeStyle, citations }) {
  const c = data.company;
  return (
    <section data-screen-label="Snapshot" style={{ marginBottom: 88 }}>
      <SectionHeader eyebrow="Snapshot" n="01" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 28 }}>
        <CompanyLogo size={64} name={c.name} />
        <div style={{ flex: 1, paddingTop: 4 }}>
          <h1 className="h1" style={{ margin: 0, marginBottom: 6, color: "var(--text)" }}>
            {c.name}
          </h1>
          <div style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 14, fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
            {c.tagline}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {c.badges.map((b, i) => (
              <span key={i} style={{
                fontSize: 12, padding: "3px 9px", borderRadius: 99,
                border: "1px solid var(--border)", color: "var(--text-muted)",
                background: "var(--bg-elevated)",
              }}>{b}</span>
            ))}
          </div>
        </div>
      </div>

      <p className="lead">
        {c.summary}<Citation n={1} citations={citations} citeStyle={citeStyle} /> Its wedge is a single insight: the editor — not the chat window — is where engineers actually live. By owning that surface, Cursor controls context, latency, and the upgrade path as frontier models keep getting better.<Citation n={7} citations={citations} citeStyle={citeStyle} />
      </p>
    </section>
  );
}

function CompanyLogo({ size = 64, name }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: "linear-gradient(155deg, oklch(0.32 0.07 18) 0%, oklch(0.22 0.05 18) 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-serif)", fontSize: size * 0.55,
      color: "oklch(0.9 0.05 18)", flexShrink: 0,
      border: "1px solid var(--border)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>{name?.[0] || "·"}</div>
  );
}

// ─── 2. MOAT
function MoatSection({ data, citeStyle, citations }) {
  const m = data.moat;
  return (
    <section data-screen-label="Moat" style={{ marginBottom: 96 }}>
      <SectionHeader eyebrow="Moat & Replicability" n="02" />

      {/* Score panel */}
      <div style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 32,
        padding: "32px 0", marginBottom: 28,
        borderTop: "1px solid var(--border-faint)",
        borderBottom: "1px solid var(--border-faint)",
      }}>
        <ReplicabilityScore score={m.score} />
        <div style={{ paddingTop: 4 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Moat type</div>
          <div className="h2" style={{ margin: 0, marginBottom: 14 }}>{m.label}</div>
          <p className="body-muted" style={{ margin: 0, maxWidth: 460 }}>{m.summary}</p>
        </div>
      </div>

      {/* Defensible vs not */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginBottom: 36 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 14, color: "var(--rep-green)" }}>What's actually defensible</div>
          {m.defensible.map((d, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <h3 className="h3" style={{ margin: "0 0 4px", fontSize: 16 }}>{d.title}</h3>
              <p className="body-muted" style={{ margin: 0, fontSize: 14 }}>{d.body}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 14, color: "var(--rep-rust)" }}>What looks hard but isn't</div>
          {m.notDefensible.map((d, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <h3 className="h3" style={{ margin: "0 0 4px", fontSize: 16 }}>{d.title}</h3>
              <p className="body-muted" style={{ margin: 0, fontSize: 14 }}>{d.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Callout: if you wanted to compete */}
      <div style={{
        background: "var(--callout-bg)",
        borderLeft: "2px solid var(--callout-border)",
        padding: "20px 24px",
        borderRadius: "0 6px 6px 0",
      }}>
        <div className="eyebrow" style={{ marginBottom: 8, color: "var(--accent)" }}>If you wanted to compete</div>
        <p className="serif" style={{ margin: 0, fontSize: 19, lineHeight: 1.5, color: "var(--text)", fontStyle: "italic", marginBottom: 10 }}>
          {m.replicability.verdict}
        </p>
        <p className="body" style={{ margin: 0, color: "var(--text-muted)" }}>
          {m.replicability.body}
        </p>
      </div>
    </section>
  );
}

function ReplicabilityScore({ score }) {
  // 1 = easy to replicate (red), 10 = impossible (green)
  // We grade color along that spectrum
  const colors = ["#a8553a", "#a8553a", "#b8612d", "#b8862d", "#9aa055",
                  "#7a9a55", "#6b8a55", "#5a7a4a", "#4a6a3f", "#3d5a35"];
  const color = colors[Math.max(0, Math.min(9, score - 1))];
  const pct = (score - 1) / 9;
  const r = 64;
  const c = 2 * Math.PI * r;

  return (
    <div style={{
      width: 200, padding: "12px 8px", textAlign: "center",
      borderRight: "1px solid var(--border-faint)", paddingRight: 32,
    }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Replicability</div>
      <div style={{ position: "relative", width: 160, height: 160, margin: "0 auto" }}>
        <svg viewBox="0 0 160 160" width="160" height="160">
          <circle cx="80" cy="80" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
                  transform="rotate(-90 80 80)" style={{ transition: "stroke-dashoffset 600ms ease-out" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontFamily: "var(--font-serif)", fontSize: 64, fontWeight: 400,
            color: color, lineHeight: 1, letterSpacing: "-0.04em",
          }}>{score}</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>/ 10</span>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
        Hard but not heroic
      </div>
    </div>
  );
}

window.Snapshot = Snapshot;
window.MoatSection = MoatSection;
window.Citation = Citation;
window.SectionHeader = SectionHeader;
window.CompanyLogo = CompanyLogo;
window.ReplicabilityScore = ReplicabilityScore;
