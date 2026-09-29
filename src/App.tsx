import { useEffect, useRef, useState } from "react";
import { DealTable, DealTableHandle } from "./components/DealTable";
import { StatsBar } from "./components/StatsBar";
import { Toolbar } from "./components/Toolbar";
import { SettingsPanel } from "./components/SettingsPanel";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { retryAllFailed, startTeammateSimulation, useFailedCount, useSavingCount } from "./store/pipelineStore";

function SyncPill() {
  const failed = useFailedCount();
  const saving = useSavingCount();

  if (failed > 0) {
    return (
      <button className="connection-pill connection-pill--error" onClick={() => retryAllFailed()}>
        <span className="dot" />
        {failed} save{failed === 1 ? "" : "s"} need retry
      </button>
    );
  }
  if (saving > 0) {
    return (
      <div className="connection-pill connection-pill--busy">
        <span className="dot" />
        Saving {saving.toLocaleString()}…
      </div>
    );
  }
  return (
    <div className="connection-pill connection-pill--ok">
      <span className="dot" />
      All changes synced
    </div>
  );
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<DealTableHandle>(null);

  useEffect(() => {
    const stop = startTeammateSimulation();
    return stop;
  }, []);

  useKeyboardNav({
    onFocusSearch: () => searchRef.current?.focus(),
    onEnsureVisible: (id) => tableRef.current?.scrollToId(id),
    searchFocused,
  });

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <div className="eyebrow">Sales operations</div>
          <h1>Pipeline</h1>
          <p className="app__subhead">
            One shared pipeline for 50,000 deals, 20 reps, and an imperfect network. ↑↓ move · space
            select · shift+↑↓ range · 1–7 move stage · / search · esc clear
          </p>
        </div>
        <div className="app__header-actions">
          <SyncPill />
          <button className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            ⚙ API simulator
          </button>
        </div>
      </header>
      <StatsBar />
      <Toolbar searchRef={searchRef} onSearchFocusChange={setSearchFocused} />
      <DealTable ref={tableRef} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
