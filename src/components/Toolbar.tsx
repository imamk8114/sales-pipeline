import { useState } from "react";
import { STAGES, Stage } from "../types";
import {
  OWNERS_FOR_FILTER,
  clearSelection,
  getTotalCount,
  moveDeals,
  retryAllFailed,
  selectAllFiltered,
  setFilters,
  useActivity,
  useFailedCount,
  useFilteredIds,
  useFilters,
  useSelection,
} from "../store/pipelineStore";

interface Props {
  searchRef: React.RefObject<HTMLInputElement>;
  onSearchFocusChange: (focused: boolean) => void;
  onOpenSettings: () => void;
}

export function Toolbar({ searchRef, onSearchFocusChange, onOpenSettings }: Props) {
  const filters = useFilters();
  const selection = useSelection();
  const ids = useFilteredIds();
  const failedCount = useFailedCount();
  const activity = useActivity();
  const [showActivity, setShowActivity] = useState(false);
  const total = getTotalCount();

  function apply(patch: Partial<typeof filters>) {
    setFilters(patch);
  }

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <input
          ref={searchRef}
          className="search"
          placeholder="Search company… ( / )"
          value={filters.search}
          onChange={(e) => apply({ search: e.target.value })}
          onFocus={() => onSearchFocusChange(true)}
          onBlur={() => onSearchFocusChange(false)}
        />
        <select value={filters.stage} onChange={(e) => apply({ stage: e.target.value as Stage | "all" })}>
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filters.owner} onChange={(e) => apply({ owner: e.target.value })}>
          <option value="all">All owners</option>
          {OWNERS_FOR_FILTER.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="toolbar__count">
          {ids.length.toLocaleString()} / {total.toLocaleString()}
        </span>

        <div className="toolbar__spacer" />

        {failedCount > 0 && (
          <button className="btn btn--danger" onClick={() => retryAllFailed()}>
            Retry {failedCount} failed save{failedCount === 1 ? "" : "s"}
          </button>
        )}
        <button className="btn" onClick={() => setShowActivity((v) => !v)}>
          Activity {activity.length > 0 && `(${activity.length})`}
        </button>
        <button className="btn" onClick={onOpenSettings}>
          Simulate network…
        </button>
      </div>

      {showActivity && (
        <div className="activity-panel">
          {activity.length === 0 && <div className="activity-empty">No activity yet.</div>}
          {activity.map((a) => (
            <div key={a.id} className="activity-item">
              <span>{a.message}</span>
              <span className="activity-time">{new Date(a.time).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {selection.size > 0 && (
        <div className="bulk-bar">
          <span>
            <strong>{selection.size.toLocaleString()}</strong> selected
          </span>
          <div className="bulk-bar__actions">
            <span>Move to:</span>
            {STAGES.map((s, i) => (
              <button key={s} className="btn btn--small" onClick={() => moveDeals(Array.from(selection), s)}>
                {s} <kbd>{i + 1}</kbd>
              </button>
            ))}
            <button className="btn btn--small" onClick={() => selectAllFiltered()}>
              Select all {ids.length.toLocaleString()} shown
            </button>
            <button className="btn btn--small" onClick={() => clearSelection()}>
              Clear (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
