import { useState } from "react";
import { STAGES, Stage } from "../types";
import {
  OWNERS_FOR_FILTER,
  SortField,
  clearSelection,
  getTotalCount,
  moveDeals,
  selectAllFiltered,
  setFilters,
  setSort,
  useActivity,
  useFilteredIds,
  useFilters,
  useSelection,
  useSort,
} from "../store/pipelineStore";

interface Props {
  searchRef: React.RefObject<HTMLInputElement>;
  onSearchFocusChange: (focused: boolean) => void;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "stageAge", label: "Longest in stage" },
  { field: "updatedAt", label: "Most recently active" },
  { field: "createdAt", label: "Newest lead" },
  { field: "amount", label: "Highest value" },
  { field: "company", label: "Company name" },
];

export function Toolbar({ searchRef, onSearchFocusChange }: Props) {
  const filters = useFilters();
  const selection = useSelection();
  const ids = useFilteredIds();
  const activity = useActivity();
  const { field: sortField } = useSort();
  const [showActivity, setShowActivity] = useState(false);
  const total = getTotalCount();

  function apply(patch: Partial<typeof filters>) {
    setFilters(patch);
  }

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <div className="search-wrap">
          <span className="search-wrap__icon">⌕</span>
          <input
            ref={searchRef}
            className="search"
            placeholder="Search company…"
            value={filters.search}
            onChange={(e) => apply({ search: e.target.value })}
            onFocus={() => onSearchFocusChange(true)}
            onBlur={() => onSearchFocusChange(false)}
          />
          <kbd className="search-wrap__kbd">/</kbd>
        </div>
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
        <select value={sortField} onChange={(e) => setSort(e.target.value as SortField)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.field} value={o.field}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="toolbar__spacer" />

        <span className="toolbar__count">
          {ids.length.toLocaleString()} / {total.toLocaleString()} shown
        </span>
        <button className="ghost-btn" onClick={() => setShowActivity((v) => !v)}>
          Activity {activity.length > 0 && `(${activity.length})`}
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
