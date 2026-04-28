// FounderScope — Main app shell

const { useState: aS, useEffect: aE, useRef: aR } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "darkMode": true,
  "founderCardStyle": "photo-led",
  "ringStyle": "concentric",
  "sidebarDensity": "roomy",
  "citeStyle": "superscript"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = aS("home");           // 'home' | 'report' | 'loading' | 'settings'
  const [searchOpen, setSearchOpen] = aS(false);
  const [refreshOpen, setRefreshOpen] = aS(false);
  const [sidebarCollapsed, setSidebarCollapsed] = aS(false);
  const [currentCompany, setCurrentCompany] = aS(null);
  const [progress, setProgress] = aS({ snapshot: 0, moat: 0, founders: 0, funding: 0, traction: 0, market: 0 });
  const data = window.CURSOR_DATA;

  // Apply theme
  aE(() => {
    document.documentElement.classList.toggle("theme-dark", t.darkMode);
    document.documentElement.classList.toggle("theme-light", !t.darkMode);
  }, [t.darkMode]);

  // Keyboard ⌘K
  aE(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Loading simulation
  aE(() => {
    if (view !== "loading") return;
    setProgress({ snapshot: 0, moat: 0, founders: 0, funding: 0, traction: 0, market: 0 });
    const order = ["snapshot", "founders", "funding", "moat", "traction", "market"];
    const delays = [400, 900, 1500, 2200, 2900, 3600];
    const timers = order.map((k, i) => setTimeout(() => {
      setProgress(p => ({ ...p, [k]: 1 }));
      if (i === order.length - 1) {
        setTimeout(() => setView("report"), 600);
      }
    }, delays[i]));
    return () => timers.forEach(clearTimeout);
  }, [view]);

  const onSelectCompany = (name) => {
    setSearchOpen(false);
    setCurrentCompany(name);
    setView("report");
  };
  const onResearch = (q) => {
    setSearchOpen(false);
    setCurrentCompany(q);
    setView("loading");
  };
  const onGoHome = () => { setCurrentCompany(null); setView("home"); };
  const onGoSettings = () => setView("settings");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <window.Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        density={t.sidebarDensity}
        recents={data.recents}
        currentCompany={currentCompany}
        onOpenSearch={() => setSearchOpen(true)}
        onSelectCompany={onSelectCompany}
        onGoHome={onGoHome}
        onGoSettings={onGoSettings}
        view={view}
      />

      <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
        {view === "home" && (
          <window.HomeScreen
            onResearch={onResearch}
            onOpenSearch={() => setSearchOpen(true)}
            onSelectCompany={onSelectCompany}
          />
        )}
        {view === "report" && (
          <window.ReportScreen
            data={data}
            citeStyle={t.citeStyle}
            founderCardStyle={t.founderCardStyle}
            ringStyle={t.ringStyle}
            onRefreshClick={() => setRefreshOpen(true)}
          />
        )}
        {view === "loading" && (
          <window.LoadingScreen companyName={currentCompany || data.company.name} progress={progress} />
        )}
        {view === "settings" && (
          <window.SettingsScreen
            darkMode={t.darkMode}
            onToggleDark={(v) => setTweak("darkMode", v)}
          />
        )}
      </main>

      <window.SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={onSelectCompany}
        onResearch={onResearch}
        index={data.searchIndex}
      />

      <window.RefreshModal
        open={refreshOpen}
        companyName={currentCompany || data.company.name}
        onCancel={() => setRefreshOpen(false)}
        onConfirm={() => {
          setRefreshOpen(false);
          setView("loading");
        }}
      />

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakToggle label="Dark mode" value={t.darkMode}
                     onChange={v => setTweak("darkMode", v)} />

        <TweakSection label="Layout" />
        <TweakRadio  label="Sidebar density" value={t.sidebarDensity}
                     options={["roomy", "compact"]}
                     onChange={v => setTweak("sidebarDensity", v)} />

        <TweakSection label="Founders" />
        <TweakRadio  label="Card style" value={t.founderCardStyle}
                     options={["photo-led", "type-led"]}
                     onChange={v => setTweak("founderCardStyle", v)} />

        <TweakSection label="Market rings" />
        <TweakRadio  label="Style" value={t.ringStyle}
                     options={["concentric", "stacked", "table"]}
                     onChange={v => setTweak("ringStyle", v)} />

        <TweakSection label="Citations" />
        <TweakRadio  label="Style" value={t.citeStyle}
                     options={["superscript", "bracket", "margin"]}
                     onChange={v => setTweak("citeStyle", v)} />

        <TweakSection label="Jump to screen" />
        <TweakButton label="Empty home" onClick={() => { setCurrentCompany(null); setView("home"); }} />
        <TweakButton label="Open search (⌘K)" onClick={() => setSearchOpen(true)} />
        <TweakButton label="Loading state" onClick={() => { setCurrentCompany("Stripe"); setView("loading"); }} />
        <TweakButton label="Full report"  onClick={() => { setCurrentCompany("Cursor"); setView("report"); }} />
        <TweakButton label="Refresh modal" onClick={() => { setCurrentCompany("Cursor"); setRefreshOpen(true); }} />
        <TweakButton label="Settings" onClick={() => setView("settings")} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
