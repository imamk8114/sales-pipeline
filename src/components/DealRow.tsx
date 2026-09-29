import { memo, useEffect, useState } from "react";
import { STAGES, Stage } from "../types";
import {
  moveDeals,
  retryDeal,
  selectRangeTo,
  setActiveId,
  toggleSelect,
  useDeal,
} from "../store/pipelineStore";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function stageAgeDays(stageChangedAt: number): number {
  return Math.floor((Date.now() - stageChangedAt) / 86_400_000);
}

interface Props {
  id: string;
  index: number;
  top: number;
  height: number;
  isSelected: boolean;
  isActive: boolean;
}

function DealRowInner({ id, index, top, height, isSelected, isActive }: Props) {
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

  function handleRowClick(e: React.MouseEvent) {
    setActiveId(id);
    if (e.shiftKey) selectRangeTo(id);
    else toggleSelect(id);
  }

  const age = stageAgeDays(deal.stageChangedAt);
  const stale = age >= 14 && deal.stage !== "Won" && deal.stage !== "Lost";

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
        <input type="checkbox" checked={isSelected} onChange={() => {}} onClick={handleRowClick} tabIndex={-1} aria-label={`Select ${deal.company}`} />
      </div>
      <div className="cell cell--index">{index + 1}</div>
      <div className="cell cell--company" onClick={handleRowClick} title={deal.company}>
        {deal.company}
      </div>
      <div className="cell cell--amount" onClick={handleRowClick}>
        {currency.format(deal.amount)}
      </div>
      <div className="cell cell--licences" onClick={handleRowClick}>
        {deal.licences}
      </div>
      <div className="cell cell--owner" onClick={handleRowClick}>
        {deal.owner}
      </div>
      <div className="cell cell--stage" onClick={handleRowClick}>
        <select
          value={deal.stage}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => moveDeals([id], e.target.value as Stage)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className={"cell cell--age" + (stale ? " cell--stale" : "")} onClick={handleRowClick}>
        {age}d
      </div>
      <div className="cell cell--status">
        {deal.syncStatus === "saving" && <span className="status status--saving" title="Saving…">●</span>}
        {deal.syncStatus === "error" && (
          <button className="status status--error" title={deal.lastError} onClick={() => retryDeal(id)}>
            ⚠ retry
          </button>
        )}
        {deal.syncStatus === "idle" && flash && <span className="status status--flash" title="Updated by a teammate">↻</span>}
      </div>
    </div>
  );
}

export const DealRow = memo(DealRowInner);
