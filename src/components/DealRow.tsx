import { memo, useEffect, useState } from "react";
import { STAGES, Stage } from "../types";
import {
  AT_RISK_DAYS,
  moveDeals,
  retryDeal,
  selectRangeTo,
  setActiveId,
  toggleSelect,
  useDeal,
} from "../store/pipelineStore";
import { currencyFull as currency, formatShortDate, formatStageAge } from "../format";

function stageAgeDays(stageChangedAt: number): number {
  return (Date.now() - stageChangedAt) / 86_400_000;
}

function dealNumber(id: string): string {
  return id.replace("deal-", "#");
}

interface Props {
  id: string;
  top: number;
  height: number;
  isSelected: boolean;
  isActive: boolean;
}

function DealRowInner({ id, top, height, isSelected, isActive }: Props) {
  const deal = useDeal(id);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (deal?.remoteFlashAt && Date.now() - deal.remoteFlashAt < 2500) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2500);
      return () => clearTimeout(t);
    }
  }, [deal?.remoteFlashAt]);

  if (!deal) return null;

  function handleRowClick(e: { shiftKey: boolean }) {
    setActiveId(id);
    if (e.shiftKey) selectRangeTo(id);
    else toggleSelect(id);
  }

  const age = stageAgeDays(deal.stageChangedAt);
  const stale = age >= AT_RISK_DAYS && deal.stage !== "Won" && deal.stage !== "Lost";

  return (
    <div
      className={
        "row" +
        (isSelected ? " row--selected" : "") +
        (isActive ? " row--active" : "") +
        (flash ? " row--flash" : "")
      }
      style={{ position: "absolute", top, height, width: "100%" }}
      data-row-id={id}
      role="row"
      aria-selected={isSelected}
    >
      <div className="cell cell--check">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={handleRowClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleRowClick(e);
            }
          }}
          aria-label={`Select ${deal.company}`}
        />
      </div>
      <div className="cell cell--deal" onClick={handleRowClick} title={deal.company}>
        <div className="deal-name">{deal.company}</div>
        <div className="deal-id">{dealNumber(deal.id)}</div>
      </div>
      <div className="cell cell--owner" onClick={handleRowClick}>
        <span className="avatar">{deal.owner.charAt(0)}</span>
        {deal.owner}
      </div>
      <div className="cell cell--amount" onClick={handleRowClick}>
        {currency.format(deal.amount)}
      </div>
      <div className="cell cell--licences" onClick={handleRowClick}>
        {deal.licences}
      </div>
      <div className="cell cell--stage" onClick={(e) => e.stopPropagation()}>
        <select value={deal.stage} onChange={(e) => moveDeals([id], e.target.value as Stage)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="cell cell--created" onClick={handleRowClick}>
        {formatShortDate(deal.createdAt)}
      </div>
      <div className={"cell cell--activity" + (stale ? " cell--stale" : "")} onClick={handleRowClick}>
        <span>{formatStageAge(age)}</span>
        <small>{formatShortDate(deal.updatedAt)}</small>
      </div>
      <div className="cell cell--status">
        {deal.syncStatus === "saving" && (
          <span className="status status--saving" title="Saving…">
            ●
          </span>
        )}
        {deal.syncStatus === "error" && (
          <button className="status status--error" title={deal.lastError} onClick={() => retryDeal(id)}>
            ⚠ retry
          </button>
        )}
        {deal.syncStatus === "idle" && flash && (
          <span className="status status--flash" title="Updated by a teammate">
            ↻
          </span>
        )}
        {deal.syncStatus === "idle" && !flash && <span className="status status--none">—</span>}
      </div>
    </div>
  );
}

export const DealRow = memo(DealRowInner);
