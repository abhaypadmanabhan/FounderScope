// FounderScope — Report sections part 3 (Traction, Market, Sources)

const { useState: r3S } = React;

// ─── 5. TRACTION
function TractionSection({ data, citeStyle, citations }) {
  const [metric, setMetric] = r3S("arr");
  const t = data.traction[metric];
  const labels = { arr: "ARR (estimate)", employees: "Employees", traffic: "Web traffic" };

  const yFormat = (v) => {
    if (metric === "arr") return v >= 1 ? `$${Math.round(v)}M` : `$${v.toFixed(1)}M`;
    if (metric === "employees") return Math.round(v);
    return v >= 1 ? `${Math.round(v)}M` : `${v.toFixed(1)}M`;
  };

  return (
    <section data-screen-label="Traction" style={{ marginBottom: 96 }}>
      <window.SectionHeader eyebrow="Traction" n="05" />

      {/* Toggle group */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", padding: 3, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8 }}>
          {[["arr","ARR"], ["employees","Employees"], ["traffic","Web traffic"]].map(([k, l]) => (
            <button key={k} onClick={() => setMetric(k)} className="t-200" style={{
              padding: "5px 14px", fontSize: 13, borderRadius: 5, border: 0, fontFamily: "inherit",
              background: metric === k ? "var(--bg)" : "transparent",
              color: metric === k ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer", boxShadow: metric === k ? "var(--shadow-1)" : "none",
            }}>{l}</button>
          ))}
        </div>
        <ConfidenceBadge confidence={t.confidence} source={t.source} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span className="serif num" style={{ fontSize: 36, lineHeight: 1, color: "var(--text)" }}>
            {yFormat(t.points[t.points.length - 1].v)}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{labels[metric]} · {t.points[t.points.length - 1].m}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--rep-green)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
          ↑ {Math.round(((t.points[t.points.length - 1].v / t.points[t.points.length - 5].v) - 1) * 100)}% YoY
        </div>
      </div>

      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 24px" }}>
        <window.LineChart data={t.points} height={220} accent="var(--accent)" yFormat={yFormat} label={metric} />
      </div>

      <p className="small" style={{ marginTop: 14, fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
        {metric === "arr" && (<>Triangulated from reported revenue figures<window.Citation n={1} citations={citations} citeStyle={citeStyle} /> and seat counts from public enterprise customers. Treat as directional, not exact.</>)}
        {metric === "employees" && (<>Headcount derived from LinkedIn snapshots<window.Citation n={5} citations={citations} citeStyle={citeStyle} />. The most reliable number on this page.</>)}
        {metric === "traffic" && (<>Similarweb estimates<window.Citation n={8} citations={citations} citeStyle={citeStyle} />. Useful as a directional signal; absolute numbers run high for developer-tools sites.</>)}
      </p>
    </section>
  );
}

function ConfidenceBadge({ confidence, source }) {
  const [open, setOpen] = r3S(false);
  const isConfirmed = confidence === "Confirmed";
  return (
    <span style={{ position: "relative" }}>
      <span
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
          padding: "3px 9px", borderRadius: 99,
          background: isConfirmed ? "rgba(107, 138, 85, 0.14)" : "var(--bg-elevated)",
          color: isConfirmed ? "var(--rep-green)" : "var(--text-muted)",
          border: `1px solid ${isConfirmed ? "rgba(107, 138, 85, 0.32)" : "var(--border)"}`,
          letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500,
          cursor: "default",
        }}>
        <span style={{ width: 5, height: 5, borderRadius: 99, background: isConfirmed ? "var(--rep-green)" : "var(--text-faint)" }} />
        {confidence}
      </span>
      {open && (
        <span style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30,
          width: 280, background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
          borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.5,
          color: "var(--text-muted)", boxShadow: "var(--shadow-pop)", textAlign: "left",
          textTransform: "none", letterSpacing: 0,
        }}>
          {source}
        </span>
      )}
    </span>
  );
}

// ─── 6. MARKET
function MarketSection({ data, ringStyle }) {
  const m = data.market;
  return (
    <section data-screen-label="Market" style={{ marginBottom: 96 }}>
      <window.SectionHeader eyebrow="Market & Competition" n="06" />

      <div style={{ display: "grid", gridTemplateColumns: ringStyle === "table" ? "1fr" : "auto 1fr", gap: 48, alignItems: "center", marginBottom: 48 }}>
        {ringStyle === "concentric" && <ConcentricRings tam={m.tam} sam={m.sam} som={m.som} />}
        {ringStyle === "stacked" && <StackedBars tam={m.tam} sam={m.sam} som={m.som} />}
        {ringStyle === "table" && <RingsTable tam={m.tam} sam={m.sam} som={m.som} />}

        {ringStyle !== "table" && (
          <div>
            <RingDetail tier="TAM" label={m.tam.label} value={m.tam.value} note={m.tam.note} pct={1} />
            <RingDetail tier="SAM" label={m.sam.label} value={m.sam.value} note={m.sam.note} pct={m.sam.value / m.tam.value} />
            <RingDetail tier="SOM" label={m.som.label} value={m.som.value} note={m.som.note} pct={m.som.value / m.tam.value} last />
          </div>
        )}
      </div>

      {/* Pioneer or follower */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 24,
        padding: "24px 0", marginBottom: 36,
        borderTop: "1px solid var(--border-faint)", borderBottom: "1px solid var(--border-faint)",
      }}>
        <div className="eyebrow" style={{ flexShrink: 0, paddingTop: 4, width: 140 }}>Pioneer or follower?</div>
        <div>
          <p className="serif" style={{ margin: 0, fontSize: 22, lineHeight: 1.35, fontStyle: "italic", color: "var(--text)" }}>
            "{m.pioneer.verdict}"
          </p>
          <p className="body-muted" style={{ margin: "10px 0 0", fontSize: 14 }}>{m.pioneer.body}</p>
        </div>
      </div>

      {/* Competitors */}
      <div className="eyebrow" style={{ marginBottom: 16 }}>Competitive landscape</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {m.competitors.map((c, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "14px 0", borderTop: "1px solid var(--border-faint)",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 4, flexShrink: 0,
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--text-muted)",
            }}>{c.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{c.note}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConcentricRings({ tam, sam, som }) {
  // Three nested circles, sized by sqrt of value for visual fairness
  const r1 = 130, r2 = Math.sqrt(sam.value / tam.value) * r1, r3 = Math.sqrt(som.value / tam.value) * r1;
  return (
    <svg viewBox="0 0 300 300" width="300" height="300">
      <defs>
        <radialGradient id="ringGrad">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.0" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.04" />
        </radialGradient>
      </defs>
      <circle cx="150" cy="150" r={r1} fill="url(#ringGrad)" stroke="var(--border-strong)" strokeWidth="1" />
      <circle cx="150" cy="150" r={r2} fill="var(--accent-bg)" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="150" cy="150" r={r3} fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="1.5" />

      {/* Labels */}
      <text x="150" y={150 - r1 - 10} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10" fill="var(--text-faint)" letterSpacing="0.14em">TAM</text>
      <text x="150" y={150 - r2 - 8} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10" fill="var(--text-faint)" letterSpacing="0.14em">SAM</text>
      <text x="150" y={150 + 5} textAnchor="middle" fontFamily="var(--font-serif)" fontSize="22" fill="var(--accent)" fontWeight="500">${som.value}B</text>
      <text x="150" y={150 + 22} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="9" fill="var(--text-muted)" letterSpacing="0.14em">SOM</text>
    </svg>
  );
}

function StackedBars({ tam, sam, som }) {
  return (
    <div style={{ width: 300, padding: 20 }}>
      {[
        { label: "TAM", value: tam.value, pct: 100, color: "var(--border-strong)" },
        { label: "SAM", value: sam.value, pct: (sam.value/tam.value)*100, color: "var(--accent-border)" },
        { label: "SOM", value: som.value, pct: (som.value/tam.value)*100, color: "var(--accent)" },
      ].map((row, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="eyebrow">{row.label}</span>
            <span className="serif num" style={{ fontSize: 17, color: "var(--text)" }}>${row.value}B</span>
          </div>
          <div style={{ height: 4, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${row.pct}%`, background: row.color, borderRadius: 99, transition: "width 600ms ease-out" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RingsTable({ tam, sam, som }) {
  return (
    <div>
      {[
        { label: "TAM", value: tam.value, note: tam.label, body: tam.note },
        { label: "SAM", value: sam.value, note: sam.label, body: sam.note },
        { label: "SOM", value: som.value, note: som.label, body: som.note, accent: true },
      ].map((row, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "60px 140px 1fr", gap: 24,
          padding: "16px 0", borderBottom: "1px solid var(--border-faint)",
          alignItems: "baseline",
        }}>
          <span className="eyebrow">{row.label}</span>
          <span className="serif num" style={{ fontSize: 28, color: row.accent ? "var(--accent)" : "var(--text)" }}>${row.value}B</span>
          <div>
            <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 3 }}>{row.note}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RingDetail({ tier, label, value, note, pct, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 22, paddingBottom: last ? 0 : 22, borderBottom: last ? 0 : "1px solid var(--border-faint)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="eyebrow">{tier}</span>
        <span className="serif num" style={{ fontSize: 24, color: tier === "SOM" ? "var(--accent)" : "var(--text)" }}>
          ${value}B
        </span>
      </div>
      <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{note}</div>
    </div>
  );
}

// ─── SOURCES
function SourcesSection({ citations }) {
  return (
    <section data-screen-label="Sources" style={{ marginBottom: 64, paddingTop: 36, borderTop: "1px solid var(--border)" }}>
      <window.SectionHeader eyebrow="Sources" n="07" />
      <ol style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
        {citations.map(c => (
          <li key={c.n} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--border-faint)", alignItems: "baseline" }}>
            <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 12 }}>[{c.n}]</span>
            <div>
              <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--text)"}>
                {c.source}
              </a>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", fontFamily: "var(--font-serif)", marginTop: 3 }}>"{c.quote}"</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{c.date}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

window.TractionSection = TractionSection;
window.MarketSection = MarketSection;
window.SourcesSection = SourcesSection;
