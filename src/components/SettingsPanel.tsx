import { useEffect, useState } from "react";
import { getApiConfig, setApiConfig } from "../api/fakeApi";
import { getDeal, resetLocalData, triggerTeammateEdit } from "../store/pipelineStore";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const [cfg, setCfg] = useState(getApiConfig());
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function update(patch: Partial<typeof cfg>) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    setApiConfig(next);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Simulate network conditions</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="modal__hint">
          There is no real backend. These sliders control the fake API that every save and
          teammate update goes through.
        </p>

        <label className="field">
          <span>
            Save latency: {cfg.minLatencyMs}–{cfg.maxLatencyMs} ms
          </span>
          <div className="field__row">
            <input
              type="range"
              min={0}
              max={3000}
              step={50}
              value={cfg.minLatencyMs}
              onChange={(e) => update({ minLatencyMs: Number(e.target.value) })}
            />
            <input
              type="range"
              min={0}
              max={5000}
              step={50}
              value={cfg.maxLatencyMs}
              onChange={(e) => update({ maxLatencyMs: Number(e.target.value) })}
            />
          </div>
        </label>

        <label className="field">
          <span>Save failure rate: {Math.round(cfg.failRate * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={cfg.failRate * 100}
            onChange={(e) => update({ failRate: Number(e.target.value) / 100 })}
          />
        </label>

        <hr />

        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={cfg.teammatesEnabled}
            onChange={(e) => update({ teammatesEnabled: e.target.checked })}
          />
          <span>Simulate teammates editing the pipeline</span>
        </label>

        <label className="field">
          <span>Teammate edit interval: {cfg.teammateIntervalMs} ms</span>
          <input
            type="range"
            min={200}
            max={8000}
            step={100}
            value={cfg.teammateIntervalMs}
            onChange={(e) => update({ teammateIntervalMs: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Deals changed per tick: {cfg.teammateBatchSize}</span>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={cfg.teammateBatchSize}
            onChange={(e) => update({ teammateBatchSize: Number(e.target.value) })}
          />
        </label>

        <div className="field">
          <button
            className="btn"
            onClick={() => {
              const id = triggerTeammateEdit();
              setLastTriggered(id ? (getDeal(id)?.company ?? id) : "nothing to edit");
            }}
          >
            Simulate a teammate edit now
          </button>
          <p className="modal__hint" style={{ marginTop: 8, marginBottom: 0 }}>
            Fires one teammate edit immediately instead of waiting on the random interval above —
            targets whichever row you last clicked/selected in the table, so you can reliably
            demo "we're both editing the same deal" instead of waiting on 1-in-50,000 odds.
            {lastTriggered && (
              <>
                {" "}
                Just edited: <strong>{lastTriggered}</strong>.
              </>
            )}
          </p>
        </div>

        <hr />

        <p className="modal__hint">
          Your moves, retries, and any failed saves are written to this browser's IndexedDB, so
          reloading the page picks up right where you left off instead of generating a fresh
          pipeline.
        </p>

        <div className="field__actions">
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (confirm("Reset all local data and reload with a fresh pipeline?")) {
                void resetLocalData();
              }
            }}
          >
            Reset demo data
          </button>
        </div>
      </div>
    </div>
  );
}
