import { STAGES } from "../types";
import { AT_RISK_DAYS, setFilters, useFilters, useStats } from "../store/pipelineStore";
import { currencyCompact } from "../format";

export function StatsBar() {
  const stats = useStats();
  const filters = useFilters();

  function toggleStageFilter(stage: (typeof STAGES)[number]) {
    setFilters({ stage: filters.stage === stage ? "all" : stage });
  }

  return (
    <div className="stats">
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-card__label">All deals</span>
          <span className="kpi-card__value">{stats.totalCount.toLocaleString()}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Open pipeline</span>
          <span className="kpi-card__value">{stats.openCount.toLocaleString()}</span>
          <span className="kpi-card__sub">Active opportunities</span>
        </div>
        <div className="kpi-card kpi-card--warning">
          <span className="kpi-card__label">At risk</span>
          <span className="kpi-card__value">{stats.atRiskCount.toLocaleString()}</span>
          <span className="kpi-card__sub">No stage activity in {AT_RISK_DAYS}+ days</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Open pipeline value</span>
          <span className="kpi-card__value">{currencyCompact(stats.openValue)}</span>
        </div>
      </div>

      <div className="stage-chip-row" role="group" aria-label="Filter by stage">
        {STAGES.map((s) => (
          <button
            key={s}
            className={"stage-chip" + (filters.stage === s ? " stage-chip--active" : "")}
            onClick={() => toggleStageFilter(s)}
            title={`Filter to ${s}`}
          >
            <span className="stage-chip__name">{s}</span>
            <span className="stage-chip__count">{stats.stageCounts[s].toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
