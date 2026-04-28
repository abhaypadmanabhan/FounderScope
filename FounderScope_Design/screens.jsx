// FounderScope — Screens (Home, Report, Loading, Settings, Refresh modal)

const { useState: sS, useEffect: sE } = React;

// ─── HOME (Empty state)
function HomeScreen({ onResearch, onOpenSearch, onSelectCompany }) {
  const { IconSearch, IconArrowRight } = window.Icons;
  const examples = ["Stripe", "Anthropic", "Figma", "Notion", "Cursor"];

  return (
    <div data-screen-label="Home" style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "0 32px",
    }}>
      <div style={{ maxWidth: 620, width: "100%", marginTop: -60 }}>
        <div className="eyebrow" style={{ marginBottom: 24, color: "var(--accent)" }}>
          FounderScope · v0.4
        </div>
        <h1 className="h-display" style={{ margin: "0 0 18px", color: "var(--text)" }}>
          Research any company,<br />
          <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>through a founder's eyes.</span>
        </h1>
        <p className="lead" style={{ color: "var(--text-muted)", margin: "0 0 36px", maxWidth: 520 }}>
          Moat, founders, funding, traction, market — every claim cited, every chart honest about what it knows. Built for technical founders deciding what to build next.
        </p>

        {/* Search bar */}
        <button onClick={onOpenSearch} className="t-200" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px", background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)", borderRadius: 10,
          color: "var(--text-faint)", fontSize: 16, fontFamily: "inherit",
          cursor: "text", textAlign: "left",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; }}>
          <IconSearch size={18} />
          <span style={{ flex: 1 }}>Research a company…</span>
          <span style={{
            fontSize: 11, fontFamily: "var(--font-mono)",
            padding: "3px 7px", border: "1px solid var(--border)", borderRadius: 4,
            color: "var(--text-quiet)",
          }}>⌘K</span>
        </button>

        {/* Examples */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <span className="small" style={{ color: "var(--text-faint)", fontSize: 12 }}>Try:</span>
          {examples.map((name, i) => (
            <button key={name} onClick={() => onSelectCompany(name)} className="t-200" style={{
              fontSize: 13, padding: "4px 12px", borderRadius: 99,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", bottom: 24, fontSize: 11, color: "var(--text-quiet)", display: "flex", gap: 18 }}>
        <span>Open source · MIT</span>
        <span>·</span>
        <span>Bring your own Anthropic API key</span>
        <span>·</span>
        <span>Cache shared across all users</span>
      </div>
    </div>
  );
}

// ─── REPORT
function ReportScreen({ data, citeStyle, founderCardStyle, ringStyle, onRefreshClick }) {
  const [openFounder, setOpenFounder] = sS(null);
  const { IconRefresh, IconClock, IconExternal } = window.Icons;

  return (
    <div data-screen-label="Report">
      {/* Top utility bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 48px", borderBottom: "1px solid var(--border-faint)",
        position: "sticky", top: 0, background: "var(--bg)", zIndex: 20,
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-faint)" }}>
          <IconClock size={12} />
          Cached · researched 2h ago · 18 sources
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="t-200" onClick={onRefreshClick} style={topBtn()}>
            <IconRefresh size={13} /> Refresh
          </button>
          <button className="t-200" style={topBtn()}>
            <IconExternal size={13} /> Share
          </button>
        </div>
      </div>

      {/* Content column */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 48px 48px" }}>
        <window.Snapshot data={data} citeStyle={citeStyle} citations={data.citations} />
        <window.MoatSection data={data} citeStyle={citeStyle} citations={data.citations} />
        <window.FoundersSection data={data} onOpen={setOpenFounder} cardStyle={founderCardStyle} />
        <window.FundingSection data={data} citeStyle={citeStyle} citations={data.citations} />
        <window.TractionSection data={data} citeStyle={citeStyle} citations={data.citations} />
        <window.MarketSection data={data} ringStyle={ringStyle} />
        <window.SourcesSection citations={data.citations} />
      </div>

      <window.FounderSheet f={openFounder} onClose={() => setOpenFounder(null)} citations={data.citations} />
    </div>
  );
}

function topBtn() {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "6px 12px", fontSize: 12, fontFamily: "inherit",
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    borderRadius: 6, color: "var(--text-muted)", cursor: "pointer",
  };
}

// ─── LOADING
function LoadingScreen({ companyName, progress }) {
  // progress: { snapshot, moat, founders, funding, traction, market } each 0..1
  const sections = [
    { key: "snapshot", n: "01", label: "Snapshot" },
    { key: "moat",     n: "02", label: "Moat & Replicability" },
    { key: "founders", n: "03", label: "Founders" },
    { key: "funding",  n: "04", label: "Funding journey" },
    { key: "traction", n: "05", label: "Traction" },
    { key: "market",   n: "06", label: "Market & Competition" },
  ];

  return (
    <div data-screen-label="Loading" style={{ maxWidth: 720, margin: "0 auto", padding: "56px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, color: "var(--text-muted)", fontSize: 13 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", animation: "pulse 1.4s ease-in-out infinite" }} />
        Researching <span style={{ color: "var(--text)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{companyName}</span>
      </div>
      <h1 className="h1" style={{ margin: 0, marginBottom: 8, color: "var(--text)" }}>{companyName}</h1>
      <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 36 }} />

      {sections.map(s => (
        <div key={s.key} style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-quiet)" }}>{s.n}</span>
            <span className="eyebrow">{s.label}</span>
            <span style={{ height: 1, background: "var(--border-faint)", flex: 1 }} />
            {progress[s.key] >= 1
              ? <span style={{ fontSize: 11, color: "var(--rep-green)" }}>done</span>
              : <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{Math.round((progress[s.key] || 0) * 100)}%</span>}
          </div>
          {progress[s.key] >= 1 ? (
            <div className="fade-in" style={{ color: "var(--text-muted)", fontSize: 14, fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
              ✓ rendered above
            </div>
          ) : (
            <div>
              <div className="skeleton" style={{ height: 18, marginBottom: 12, width: "85%" }} />
              <div className="skeleton" style={{ height: 12, marginBottom: 8, width: "100%" }} />
              <div className="skeleton" style={{ height: 12, marginBottom: 8, width: "94%" }} />
              <div className="skeleton" style={{ height: 12, marginBottom: 8, width: "78%" }} />
              {(s.key === "moat" || s.key === "funding" || s.key === "traction") && (
                <div className="skeleton" style={{ height: 180, marginTop: 18, borderRadius: 8 }} />
              )}
            </div>
          )}
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}

// ─── REFRESH MODAL
function RefreshModal({ open, companyName, onCancel, onConfirm }) {
  const { IconRefresh } = window.Icons;
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(8,7,5,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16,
      animation: "fadeIn 200ms ease-out",
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(440px, 100%)", background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)", borderRadius: 12,
        padding: 28, boxShadow: "var(--shadow-pop)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-bg)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", marginBottom: 16,
        }}>
          <IconRefresh size={18} />
        </div>
        <h2 className="h2" style={{ margin: "0 0 8px", fontSize: 22 }}>
          Re-research <span style={{ fontStyle: "italic" }}>{companyName}?</span>
        </h2>
        <p className="body-muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
          This will use your Anthropic API key. Estimated cost <span className="num" style={{ color: "var(--text)" }}>~$0.40</span>.
        </p>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
          The updated report becomes the new cached version for everyone.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="t-200" style={ghostBtn()}>Cancel</button>
          <button onClick={onConfirm} className="t-200" style={primaryBtn()}>
            <IconRefresh size={13} /> Refresh now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS
function SettingsScreen({ darkMode, onToggleDark }) {
  const { IconKey, IconExternal, IconEye, IconEyeOff, IconMoon, IconSun } = window.Icons;
  const [show, setShow] = sS(false);
  const [val, setVal] = sS("sk-ant-api03-•••••••••••••••••••••••••••••••••••");
  const [saved, setSaved] = sS(false);

  return (
    <div data-screen-label="Settings" style={{ maxWidth: 640, margin: "0 auto", padding: "72px 48px 48px" }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>Settings</div>
      <h1 className="h1" style={{ margin: "0 0 12px" }}>Settings</h1>
      <p className="body-muted" style={{ marginBottom: 48 }}>
        Two things to configure. Both stay in your browser.
      </p>

      {/* API key card */}
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 10, padding: 24, marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <IconKey size={15} stroke="var(--accent)" />
          <h3 className="h3" style={{ margin: 0, fontSize: 17 }}>Anthropic API key</h3>
        </div>
        <p className="small" style={{ marginBottom: 18, fontSize: 13 }}>
          Stored locally in your browser. Never sent to our servers except to make research requests on your behalf.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type={show ? "text" : "password"}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="sk-ant-api03-…"
              style={{
                width: "100%", padding: "9px 36px 9px 12px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, fontFamily: "var(--font-mono)",
                fontSize: 13, color: "var(--text)", outline: 0,
              }}
            />
            <button onClick={() => setShow(!show)} className="t-200" style={{
              position: "absolute", right: 6, top: 6, width: 28, height: 26, border: 0,
              background: "transparent", color: "var(--text-faint)", cursor: "pointer",
              borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              {show ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            </button>
          </div>
          <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }}
            className="t-200" style={primaryBtn()}>
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="t-200" style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12,
          color: "var(--accent)", textDecoration: "none",
        }}>
          Get a key at console.anthropic.com <IconExternal size={11} />
        </a>
      </div>

      {/* Theme card */}
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 10, padding: 24, marginBottom: 24,
      }}>
        <h3 className="h3" style={{ margin: "0 0 4px", fontSize: 17 }}>Appearance</h3>
        <p className="small" style={{ marginBottom: 16, fontSize: 13 }}>
          Default is dark. Light mode is intentional, not an afterthought.
        </p>
        <div style={{ display: "inline-flex", padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
          <button onClick={() => onToggleDark(false)} className="t-200" style={modeBtn(!darkMode)}>
            <IconSun size={13} /> Light
          </button>
          <button onClick={() => onToggleDark(true)} className="t-200" style={modeBtn(darkMode)}>
            <IconMoon size={13} /> Dark
          </button>
        </div>
      </div>

      <div style={{ marginTop: 48, fontSize: 12, color: "var(--text-quiet)", lineHeight: 1.7 }}>
        FounderScope is open source.<br />
        github.com/founderscope · Apache-2.0
      </div>
    </div>
  );
}

function ghostBtn() {
  return {
    padding: "8px 16px", fontSize: 13, fontFamily: "inherit",
    background: "transparent", border: "1px solid var(--border)",
    borderRadius: 6, color: "var(--text-muted)", cursor: "pointer",
  };
}
function primaryBtn() {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 16px", fontSize: 13, fontFamily: "inherit",
    background: "var(--accent)", border: "1px solid var(--accent)",
    borderRadius: 6, color: "var(--accent-fg)", cursor: "pointer", fontWeight: 500,
  };
}
function modeBtn(active) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 14px", fontSize: 13, fontFamily: "inherit",
    background: active ? "var(--bg-elevated)" : "transparent",
    border: 0, borderRadius: 5, color: active ? "var(--text)" : "var(--text-muted)",
    cursor: "pointer", boxShadow: active ? "var(--shadow-1)" : "none",
  };
}

window.HomeScreen = HomeScreen;
window.ReportScreen = ReportScreen;
window.LoadingScreen = LoadingScreen;
window.RefreshModal = RefreshModal;
window.SettingsScreen = SettingsScreen;
