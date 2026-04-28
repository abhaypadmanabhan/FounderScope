// FounderScope — Sidebar (collapsible, with search trigger and recents)

const { useState, useEffect, useRef, useMemo } = React;

function Sidebar({
  collapsed,
  onToggle,
  density,           // 'roomy' | 'compact'
  recents,
  currentCompany,    // string | null
  onOpenSearch,
  onSelectCompany,
  onGoHome,
  onGoSettings,
  view,              // current view name
}) {
  const {
    IconSearch, IconHome, IconSettings, IconCommand, IconChevronsLeft, IconPanel,
  } = window.Icons;

  const padY = density === "compact" ? 4 : 7;
  const itemFs = density === "compact" ? 13 : 14;
  const sidebarW = 264;

  if (collapsed) {
    return (
      <aside style={{
        width: 56, flexShrink: 0, borderRight: "1px solid var(--border)",
        background: "var(--bg)", display: "flex", flexDirection: "column",
        alignItems: "center", paddingTop: 14, paddingBottom: 14, gap: 4,
      }}>
        <button className="t-200" onClick={onToggle}
          title="Expand sidebar"
          style={iconBtn()}>
          <IconPanel size={16} />
        </button>
        <div style={{ height: 8 }} />
        <button className="t-200" onClick={onOpenSearch} title="Search (⌘K)" style={iconBtn(view === "home")}>
          <IconSearch size={16} />
        </button>
        <button className="t-200" onClick={onGoHome} title="Home" style={iconBtn(view === "home")}>
          <IconHome size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button className="t-200" onClick={onGoSettings} title="Settings" style={iconBtn(view === "settings")}>
          <IconSettings size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside style={{
      width: sidebarW, flexShrink: 0, borderRight: "1px solid var(--border)",
      background: "var(--bg)", display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
    }}>
      {/* Logo + collapse */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 14px 12px" }}>
        <button onClick={onGoHome} style={{
          display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, padding: 0, cursor: "pointer",
        }}>
          <Logomark />
          <span className="serif" style={{ fontSize: 17, color: "var(--text)", letterSpacing: "-0.01em" }}>
            FounderScope
          </span>
        </button>
        <button className="t-200" onClick={onToggle} title="Collapse sidebar" style={iconBtn(false, 28)}>
          <IconChevronsLeft size={14} />
        </button>
      </div>

      {/* Search trigger */}
      <div style={{ padding: "4px 10px 12px" }}>
        <button onClick={onOpenSearch} className="t-200" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", background: "var(--bg-elevated)",
          border: "1px solid var(--border)", borderRadius: 8,
          color: "var(--text-faint)", fontSize: 13,
          cursor: "text", textAlign: "left",
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-strong)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
          <IconSearch size={14} />
          <span style={{ flex: 1 }}>Research a company…</span>
          <span style={{
            fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-quiet)",
            display: "inline-flex", alignItems: "center", gap: 2,
            padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 4,
          }}>⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <div style={{ padding: "0 6px" }}>
        <NavItem icon={<IconHome size={15} />} label="Home" active={view === "home"} onClick={onGoHome} density={density} />
      </div>

      {/* Recents */}
      <div style={{ padding: "16px 16px 4px" }}>
        <div className="eyebrow">Recently researched</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
        {currentCompany && !recents.find(r => r.name === currentCompany) && (
          <RecentItem
            company={{ name: currentCompany, when: "now", initial: currentCompany[0], hue: 18 }}
            active
            density={density}
            onClick={() => onSelectCompany(currentCompany)}
          />
        )}
        {recents.map((r) => (
          <RecentItem
            key={r.name}
            company={r}
            active={currentCompany === r.name}
            density={density}
            onClick={() => onSelectCompany(r.name)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "8px 6px" }}>
        <NavItem icon={<IconSettings size={15} />} label="Settings" active={view === "settings"} onClick={onGoSettings} density={density} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px 4px", color: "var(--text-quiet)", fontSize: 11,
        }}>
          <span>v0.4.2 · open source</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--rep-green)" }} />
            cache fresh
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, onClick, density }) {
  return (
    <button onClick={onClick} className="t-200" style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: density === "compact" ? "5px 10px" : "7px 10px",
      borderRadius: 6, background: active ? "var(--bg-active)" : "transparent",
      color: active ? "var(--text)" : "var(--text-muted)",
      border: 0, fontSize: density === "compact" ? 13 : 14,
      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <span style={{ color: active ? "var(--accent)" : "var(--text-faint)", display: "inline-flex" }}>{icon}</span>
      {label}
    </button>
  );
}

function RecentItem({ company, active, density, onClick }) {
  return (
    <button onClick={onClick} className="t-200" style={{
      width: "100%", display: "flex", alignItems: "center", gap: 9,
      padding: density === "compact" ? "5px 10px" : "7px 10px",
      borderRadius: 6, background: active ? "var(--bg-active)" : "transparent",
      color: active ? "var(--text)" : "var(--text-muted)",
      border: 0, fontSize: density === "compact" ? 13 : 14,
      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <CompanyMark name={company.name} initial={company.initial} hue={company.hue} size={20} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company.name}</span>
      <span style={{ color: "var(--text-quiet)", fontSize: 11 }}>{company.when}</span>
    </button>
  );
}

function Logomark() {
  // A small mark — concentric arcs evoking the moat/replicability ring
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9.5" stroke="var(--text-faint)" strokeOpacity="0.5" />
      <circle cx="11" cy="11" r="5.5" stroke="var(--text-muted)" strokeOpacity="0.7" />
      <circle cx="11" cy="11" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

function CompanyMark({ name, initial, hue = 0, size = 24 }) {
  // Editorial-style monogram: slight desaturation, serif initial
  const bg = `oklch(0.32 0.04 ${hue})`;
  const fg = `oklch(0.86 0.06 ${hue})`;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: 4,
      background: bg, color: fg,
      fontFamily: "var(--font-serif)", fontSize: size * 0.55, fontWeight: 500,
      letterSpacing: 0, flexShrink: 0,
      border: "1px solid rgba(255,255,255,0.04)",
    }}>{initial || (name && name[0]) || "·"}</span>
  );
}

function iconBtn(active = false, sz = 32) {
  return {
    width: sz, height: sz, display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 6, border: 0, background: active ? "var(--bg-active)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-muted)", cursor: "pointer",
  };
}

window.Sidebar = Sidebar;
window.CompanyMark = CompanyMark;
window.Logomark = Logomark;
