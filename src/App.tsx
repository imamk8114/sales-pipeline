import { useEffect, useRef, useState } from "react";
import { DealTable, DealTableHandle } from "./components/DealTable";
import { Toolbar } from "./components/Toolbar";
import { SettingsPanel } from "./components/SettingsPanel";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { startTeammateSimulation } from "./store/pipelineStore";

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
        <h1>Pipeline</h1>
        <span className="app__hint">
          ↑↓ move · space select · shift+↑↓ range · 1–7 move stage · / search · esc clear
        </span>
      </header>
      <Toolbar
        searchRef={searchRef}
        onSearchFocusChange={setSearchFocused}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <DealTable ref={tableRef} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
