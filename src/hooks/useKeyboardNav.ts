import { useEffect } from "react";
import { STAGES } from "../types";
import {
  clearSelection,
  getActiveId,
  getSelection,
  moveActiveBy,
  moveDeals,
  selectAllFiltered,
  toggleSelect,
} from "../store/pipelineStore";

interface Options {
  onFocusSearch: () => void;
  onEnsureVisible: (id: string) => void;
  searchFocused: boolean;
}

export function useKeyboardNav({ onFocusSearch, onEnsureVisible, searchFocused }: Options) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (searchFocused) {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (e.key === "/") {
        e.preventDefault();
        onFocusSearch();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        moveActiveBy(1, e.shiftKey);
        const id = getActiveId();
        if (id) onEnsureVisible(id);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        moveActiveBy(-1, e.shiftKey);
        const id = getActiveId();
        if (id) onEnsureVisible(id);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        const id = getActiveId();
        if (id) toggleSelect(id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllFiltered();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (e.key >= "1" && e.key <= "7") {
        e.preventDefault();
        const stage = STAGES[Number(e.key) - 1];
        if (!stage) return;
        const sel = getSelection();
        const active = getActiveId();
        const ids = sel.size > 0 ? Array.from(sel) : active ? [active] : [];
        if (ids.length > 0) moveDeals(ids, stage);
        return;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onFocusSearch, onEnsureVisible, searchFocused]);
}
