import { useRef, useImperativeHandle, forwardRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DealRow } from "./DealRow";
import {
  SortField,
  clearSelection,
  selectAllFiltered,
  setSort,
  useActiveId,
  useFilteredIds,
  useSelection,
  getSort,
} from "../store/pipelineStore";

const ROW_HEIGHT = 52;

export interface DealTableHandle {
  scrollToId: (id: string) => void;
}

interface HeaderProps {
  ids: string[];
  selection: Set<string>;
}

function Header({ ids, selection }: HeaderProps) {
  const { field: sortField, dir: sortDir } = getSort();
  function arrow(f: SortField) {
    if (sortField !== f) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  // Filters clear the selection, so a selection can never outlive the filtered
  // set it was made in — meaning "same size" is a correct, O(1) stand-in for
  // "every currently-shown deal is selected" (no need to check membership one
  // by one across up to 50k rows).
  const allSelected = ids.length > 0 && selection.size === ids.length;
  const someSelected = selection.size > 0 && !allSelected;

  return (
    <div className="row row--header" role="row">
      <div className="cell cell--check">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => (allSelected ? clearSelection() : selectAllFiltered())}
          aria-label={allSelected ? "Deselect all shown deals" : "Select all shown deals"}
          title={allSelected ? "Deselect all shown" : `Select all ${ids.length.toLocaleString()} shown`}
        />
      </div>
      <div className="cell cell--deal sortable" onClick={() => setSort("company")}>
        Deal{arrow("company")}
      </div>
      <div className="cell cell--owner">Owner</div>
      <div className="cell cell--amount sortable" onClick={() => setSort("amount")}>
        Value{arrow("amount")}
      </div>
      <div className="cell cell--licences">Licences</div>
      <div className="cell cell--stage">Stage</div>
      <div className="cell cell--created sortable" onClick={() => setSort("createdAt")}>
        Created{arrow("createdAt")}
      </div>
      <div className="cell cell--activity sortable" onClick={() => setSort("updatedAt")}>
        Last activity{arrow("updatedAt")}
      </div>
      <div className="cell cell--status">Save</div>
    </div>
  );
}

export const DealTable = forwardRef<DealTableHandle>(function DealTable(_props, ref) {
  const ids = useFilteredIds();
  const selection = useSelection();
  const activeId = useActiveId();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  useImperativeHandle(ref, () => ({
    scrollToId(id: string) {
      const idx = ids.indexOf(id);
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
    },
  }));

  const items = virtualizer.getVirtualItems();

  return (
    <div className="table-wrap">
      <Header ids={ids} selection={selection} />
      <div ref={parentRef} className="table-scroll" role="rowgroup">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const id = ids[vi.index];
            return (
              <DealRow
                key={id}
                id={id}
                top={vi.start}
                height={vi.size}
                isSelected={selection.has(id)}
                isActive={id === activeId}
              />
            );
          })}
        </div>
      </div>
      <div className="table-footer">
        {ids.length.toLocaleString()} deal{ids.length === 1 ? "" : "s"} shown
        {selection.size > 0 && ` · ${selection.size.toLocaleString()} selected`}
      </div>
    </div>
  );
});
