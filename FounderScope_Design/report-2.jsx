// FounderScope — Report sections part 2 (Founders, Funding, Traction, Market, Sources)

const { useState: r2S } = React;

// ─── 3. FOUNDERS
function FoundersSection({ data, onOpen, cardStyle }) {
  return (
    <section data-screen-label="Founders" style={{ marginBottom: 96 }}>
      <window.SectionHeader eyebrow="Founders" n="03" />
      <p className="body-muted" style={{ marginBottom: 28, maxWidth: 540 }}>
        Four MIT classmates. All technical. Tight role splits, almost no overlap.
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: cardStyle === "type-led" ? "1fr 1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        gap: cardStyle === "type-led" ? 0 : 16,
      }}>
        {data.founders.map((f, i) => (
          cardStyle === "type-led"
            ? <FounderCardTypeLed key={f.id} f={f} onClick={() => onOpen(f)} divider={i < data.founders.length - (data.founders.length % 2 === 0 ? 2 : 1)} />
            : <FounderCardPhotoLed key={f.id} f={f} onClick={() => onOpen(f)} />
        ))}
      </div>
    </section>
  );
}

function FounderAvatar({ f, size = 56 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(140deg, oklch(0.42 0.06 ${f.avatarHue}) 0%, oklch(0.26 0.05 ${f.avatarHue}) 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-serif)", fontSize: size * 0.42,
      color: `oklch(0.92 0.04 ${f.avatarHue})`,
      border: "1px solid var(--border)",
    }}>{f.avatar}</div>
  );
}

function FounderCardPhotoLed({ f, onClick }) {
  return (
    <button onClick={onClick} className="t-200" style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14,
      padding: 20, background: "var(--bg-elevated)",
      border: "1px solid var(--border)", borderRadius: 8,
      cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "var(--text)",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}>
      <FounderAvatar f={f} size={56} />
      <div>
        <div className="serif" style={{ fontSize: 19, color: "var(--text)", marginBottom: 2 }}>{f.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{f.role}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{f.bring}</div>
      </div>
    </button>
  );
}

function FounderCardTypeLed({ f, onClick, divider }) {
  return (
    <button onClick={onClick} className="t-200" style={{
      display: "block", textAlign: "left", padding: "20px 24px",
      background: "transparent", border: 0,
      borderBottom: divider ? "1px solid var(--border-faint)" : 0,
      borderRight: "1px solid var(--border-faint)",
      cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
    }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>{f.name}</div>
        <span style={{ fontSize: 11, color: "var(--text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{f.type}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
        {f.role}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, maxWidth: 320 }}>{f.bring}</div>
    </button>
  );
}

function FounderSheet({ f, onClose, citations }) {
  const { IconClose, IconExternal, IconTwitter, IconLinkedIn, IconLink } = window.Icons;
  if (!f) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 90, animation: "fadeIn 200ms ease-out",
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(8,7,5,0.5)",
      }} />
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: "min(520px, 100vw)", background: "var(--bg-elevated)",
        borderLeft: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-pop)",
        overflowY: "auto", padding: 36,
        animation: "slideIn 200ms ease-out",
      }}>
        <button onClick={onClose} className="t-200" style={{
          position: "absolute", top: 16, right: 16,
          width: 32, height: 32, borderRadius: 6,
          border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <IconClose size={16} />
        </button>

        <FounderAvatar f={f} size={88} />
        <h2 className="h2" style={{ margin: "20px 0 4px" }}>{f.name}</h2>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 14, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{f.role}</div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
          padding: "3px 9px", borderRadius: 99,
          background: "var(--accent-bg)", color: "var(--accent)",
          border: "1px solid var(--accent-border)", marginBottom: 24,
        }}>
          <span style={{ width: 5, height: 5, background: "var(--accent)", borderRadius: 99 }} />
          {f.type}
        </span>

        <p className="body" style={{ marginBottom: 24, color: "var(--text)" }}>{f.bio}</p>

        <DetailRow label="Education">{f.education}</DetailRow>
        <DetailRow label="Prior">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {f.prior.map((p, i) => (
              <span key={i} style={{
                fontSize: 12, padding: "3px 9px", borderRadius: 99,
                border: "1px solid var(--border)", color: "var(--text-muted)",
              }}>{p}</span>
            ))}
          </div>
        </DetailRow>
        <DetailRow label="Notable">
          <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--text)" }}>{f.notable}</span>
        </DetailRow>
        <DetailRow label="Links">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {f.links.twitter && <LinkRow icon={<IconTwitter size={14} />} href={`https://twitter.com/${f.links.twitter.replace('@','')}`}>{f.links.twitter}</LinkRow>}
            {f.links.linkedin && <LinkRow icon={<IconLinkedIn size={14} />} href={`https://linkedin.com/${f.links.linkedin}`}>linkedin.com/{f.links.linkedin}</LinkRow>}
            {f.links.site && <LinkRow icon={<IconLink size={14} />} href={`https://${f.links.site}`}>{f.links.site}</LinkRow>}
          </div>
        </DetailRow>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div style={{ marginBottom: 22, paddingBottom: 22, borderBottom: "1px solid var(--border-faint)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="body" style={{ fontSize: 14, color: "var(--text-muted)" }}>{children}</div>
    </div>
  );
}

function LinkRow({ icon, href, children }) {
  const { IconExternal } = window.Icons;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="t-200" style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      color: "var(--text-muted)", textDecoration: "none", fontSize: 13,
    }}
      onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
      <span style={{ color: "var(--text-faint)" }}>{icon}</span>
      {children}
      <IconExternal size={11} />
    </a>
  );
}

// ─── 4. FUNDING
function FundingSection({ data, citeStyle, citations }) {
  const f = data.funding;
  const [hoverIdx, setHoverIdx] = r2S(null);
  const annotations = f.rounds.map(r => ({ x: r.monthIdx, y: r.cumulative, label: r.name, ...r }));
  const timeline = f.timeline.map(p => ({ ...p, label: monthLabel(p.m) }));

  return (
    <section data-screen-label="Funding" style={{ marginBottom: 96 }}>
      <window.SectionHeader eyebrow="Funding journey" n="04" />

      <div style={{
        display: "grid", gridTemplateColumns: "auto auto auto 1fr", gap: 28,
        marginBottom: 28, alignItems: "baseline",
      }}>
        <BigStat label="Total raised" value={`$${f.totalRaised + 28}M`} sub="across 4 rounds" />
        <BigStat label="Last valuation" value={`$${(f.lastValuation/1000).toFixed(1)}B`} sub="post-money, Dec 2025" cite={2} citations={citations} citeStyle={citeStyle} />
        <BigStat label="Lead, latest" value="Thrive Capital" sub="Series C" />
      </div>

      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "24px 28px", margin: "0 -28px",
      }}>
        <window.AreaChart
          data={timeline}
          height={260}
          accent="var(--accent)"
          yFormat={v => `$${v}M`}
          annotations={annotations}
          onHover={setHoverIdx}
          hoverIdx={hoverIdx}
        />
        {hoverIdx !== null && (
          <div className="fade-in" style={{
            display: "grid", gridTemplateColumns: "auto auto auto auto", gap: 24,
            marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-faint)",
            fontSize: 13,
          }}>
            <div><span className="eyebrow">Round</span><div style={{ marginTop: 4, fontFamily: "var(--font-serif)", fontSize: 17 }}>{f.rounds[hoverIdx].name}</div></div>
            <div><span className="eyebrow">Size</span><div style={{ marginTop: 4, color: "var(--text)" }} className="num">${f.rounds[hoverIdx].amount}M</div></div>
            <div><span className="eyebrow">Date</span><div style={{ marginTop: 4, color: "var(--text-muted)" }}>{monthLabel(f.rounds[hoverIdx].monthIdx)}</div></div>
            <div><span className="eyebrow">Lead</span><div style={{ marginTop: 4, color: "var(--text)" }}>{f.rounds[hoverIdx].lead}</div></div>
          </div>
        )}
      </div>

      {/* Investors table */}
      <div style={{ marginTop: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Investors by round</div>
        <div style={{ borderTop: "1px solid var(--border-faint)" }}>
          {f.rounds.map((r, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "140px 80px 1fr", gap: 16,
              padding: "14px 0", borderBottom: "1px solid var(--border-faint)",
              alignItems: "baseline",
            }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 16 }}>{r.name}</div>
              <div className="num" style={{ color: "var(--text-muted)", fontSize: 13 }}>${r.amount}M</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {r.investors.map((inv, j) => (
                  <span key={j} style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 4,
                    border: "1px solid var(--border-faint)", color: "var(--text-muted)",
                  }}>{inv}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BigStat({ label, value, sub, cite, citations, citeStyle }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="serif num" style={{ fontSize: 28, lineHeight: 1.1, color: "var(--text)" }}>
        {value}
        {cite && <window.Citation n={cite} citations={citations} citeStyle={citeStyle} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function monthLabel(idx) {
  const start = new Date(2022, 8); // Sep 2022
  const d = new Date(start.getFullYear(), start.getMonth() + idx);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

window.FoundersSection = FoundersSection;
window.FounderSheet = FounderSheet;
window.FundingSection = FundingSection;
