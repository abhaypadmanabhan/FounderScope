// FounderScope — Search command palette (Origin UI / cmdk-style combobox)

const { useState: useStateS, useEffect: useEffectS, useRef: useRefS } = React;

function SearchPalette({ open, onClose, onSelect, onResearch, index }) {
  const { IconSearch, IconArrowRight, IconCorner, IconCommand } = window.Icons;
  const { CompanyMark } = window;
  const [q, setQ] = useStateS("");
  const [hi, setHi] = useStateS(0);
  const inputRef = useRefS(null);

  useEffectS(() => {
    if (open) {
      setQ(""); setHi(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const matches = !q.trim()
    ? index.slice(0, 6)
    : index.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  const totalRows = matches.length + 1; // +1 for the "Press Enter to research" row

  useEffectS(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => (h + 1) % totalRows); }
      if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => (h - 1 + totalRows) % totalRows); }
      if (e.key === "Enter") {
        e.preventDefault();
        if (hi < matches.length) onSelect(matches[hi].name);
        else if (q.trim()) onResearch(q.trim());
        else if (matches[0]) onSelect(matches[0].name);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hi, totalRows, matches, q, onSelect, onResearch, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(8,7,5,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "14vh", animation: "fadeIn 200ms ease-out",
      }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(640px, calc(100vw - 32px))",
        background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
        borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden",
      }}>
        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-faint)" }}>
          <IconSearch size={16} stroke="var(--text-faint)" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }}
            placeholder="Research a company…"
            style={{
              flex: 1, background: "transparent", border: 0, outline: 0,
              fontFamily: "inherit", fontSize: 16, color: "var(--text)",
            }} />
          <kbd style={kbdStyle()}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ padding: 6, maxHeight: 380, overflowY: "auto" }}>
          {matches.length > 0 && (
            <div style={{ padding: "6px 10px 4px" }} className="eyebrow">
              From your cache
            </div>
          )}
          {matches.map((c, i) => (
            <button key={c.name}
              onMouseEnter={() => setHi(i)}
              onClick={() => onSelect(c.name)}
              className="t-200"
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "9px 10px", borderRadius: 6, border: 0, background: hi === i ? "var(--bg-active)" : "transparent",
                color: "var(--text)", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}>
              <CompanyMark name={c.name} initial={c.initial} hue={c.hue} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)" }}>researched {c.when}</div>
              </div>
              {hi === i && <IconCorner size={14} stroke="var(--text-faint)" />}
            </button>
          ))}

          {/* Separator */}
          <div style={{ height: 1, background: "var(--border-faint)", margin: "8px 4px" }} />

          {/* Fresh research */}
          <button
            onMouseEnter={() => setHi(matches.length)}
            onClick={() => q.trim() && onResearch(q.trim())}
            disabled={!q.trim()}
            className="t-200"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 6, border: 0,
              background: hi === matches.length ? "var(--bg-active)" : "transparent",
              color: q.trim() ? "var(--text)" : "var(--text-quiet)",
              cursor: q.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", textAlign: "left",
            }}>
            <span style={{
              width: 28, height: 28, borderRadius: 4,
              border: "1px dashed var(--border-strong)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)",
            }}>
              <IconArrowRight size={14} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>
                {q.trim() ? <>Press <kbd style={kbdInline()}>Enter</kbd> to research <span style={{ color: "var(--accent)", fontWeight: 500 }}>{q.trim()}</span></>
                          : "Type a company name to research"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                Fresh research · uses your Anthropic API key
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "8px 14px", borderTop: "1px solid var(--border-faint)",
          color: "var(--text-quiet)", fontSize: 11,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <kbd style={kbdInline()}>↑</kbd><kbd style={kbdInline()}>↓</kbd> navigate
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <kbd style={kbdInline()}>↵</kbd> select
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <kbd style={kbdInline()}>esc</kbd> close
          </span>
          <span style={{ flex: 1 }} />
          <span>Source: ui.shadcn.com · originui.com</span>
        </div>
      </div>
    </div>
  );
}

function kbdStyle() {
  return {
    fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-faint)",
    padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4,
    background: "var(--bg-sunken)",
  };
}
function kbdInline() {
  return {
    fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-faint)",
    padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3,
    background: "var(--bg)", margin: "0 1px",
  };
}

window.SearchPalette = SearchPalette;
