import { useSyncExternalStore } from "react";
import { Deal, Stage, STAGES } from "../types";
import { generateDeals, updateDealRemote, subscribeTeammateChanges, TeammateChange } from "../api/fakeApi";

const TOTAL_DEALS = 50_000;
const MAX_CONCURRENT_SAVES = 6;

// ---------------------------------------------------------------------------
// Core mutable state. We deliberately avoid immutable copies of the deals map
// (Map/spread of 50k entries on every edit) and instead mutate in place and
// notify only the listeners that actually care: per-row subscribers for a
// single deal's cell, and a small set of "list-level" subscribers for things
// that affect which rows are visible/selected/counted.
// ---------------------------------------------------------------------------

const deals = new Map<string, Deal>();
const allIds: string[] = [];

for (const d of generateDeals(TOTAL_DEALS)) {
  deals.set(d.id, d);
  allIds.push(d.id);
}

export const OWNERS_FOR_FILTER = Array.from(new Set(allIds.map((id) => deals.get(id)!.owner))).sort();

export const AT_RISK_DAYS = 14;

function isTerminal(stage: Stage) {
  return stage === "Won" || stage === "Lost";
}

function stageAgeDaysOf(stageChangedAt: number): number {
  return (Date.now() - stageChangedAt) / 86_400_000;
}

// ---------------------------------------------------------------------------
// Dashboard stats (KPI cards + per-stage counts). Kept as a running total
// that's adjusted by small deltas whenever a deal's stage/amount changes,
// rather than re-scanned from all 50k deals on every render or every edit.
// ---------------------------------------------------------------------------

export interface Stats {
  totalCount: number;
  openCount: number;
  atRiskCount: number;
  openValue: number;
  stageCounts: Record<Stage, number>;
}

function computeStatsFromScratch(): Stats {
  const stageCounts = {} as Record<Stage, number>;
  for (const s of STAGES) stageCounts[s] = 0;
  let openCount = 0;
  let atRiskCount = 0;
  let openValue = 0;
  for (const id of allIds) {
    const d = deals.get(id)!;
    stageCounts[d.stage]++;
    if (!isTerminal(d.stage)) {
      openCount++;
      openValue += d.amount;
      if (stageAgeDaysOf(d.stageChangedAt) >= AT_RISK_DAYS) atRiskCount++;
    }
  }
  return { totalCount: allIds.length, openCount, atRiskCount, openValue, stageCounts };
}

let stats: Stats = computeStatsFromScratch();
const statsListeners = new Set<() => void>();

function notifyStats() {
  statsListeners.forEach((cb) => cb());
}

export function useStats(): Stats {
  return useSyncExternalStore(
    (cb) => {
      statsListeners.add(cb);
      return () => statsListeners.delete(cb);
    },
    () => stats
  );
}

/** Adjusts the running stats for a single deal's before/after state. */
function updateStatsForChange(before: Deal, after: Deal) {
  let changed = false;
  const stageCounts = { ...stats.stageCounts };
  let { openCount, atRiskCount, openValue } = stats;

  if (before.stage !== after.stage) {
    stageCounts[before.stage]--;
    stageCounts[after.stage]++;
    const wasOpen = !isTerminal(before.stage);
    const isOpen = !isTerminal(after.stage);
    if (wasOpen && stageAgeDaysOf(before.stageChangedAt) >= AT_RISK_DAYS) atRiskCount--;
    if (wasOpen && !isOpen) openValue -= before.amount;
    if (!wasOpen && isOpen) openValue += after.amount;
    if (wasOpen !== isOpen) openCount += isOpen ? 1 : -1;
    changed = true;
  } else if (before.amount !== after.amount && !isTerminal(after.stage)) {
    openValue += after.amount - before.amount;
    changed = true;
  }

  if (changed) {
    stats = { totalCount: stats.totalCount, openCount, atRiskCount, openValue, stageCounts };
    notifyStats();
  }
}

// Natural day-rollover means a deal can cross the "at risk" age threshold
// without anyone touching it. A full rescan is a few ms over 50k rows, so a
// low-frequency timer is cheap insurance against that drift; it's not what
// keeps the cards correct moment-to-moment (the deltas above do that).
setInterval(() => {
  stats = computeStatsFromScratch();
  notifyStats();
}, 60_000);

// per-row listeners
const rowListeners = new Map<string, Set<() => void>>();
// list-level listeners (filters, sort, selection, view order, counts, activity feed)
const listListeners = new Set<() => void>();

function notifyRow(id: string) {
  rowListeners.get(id)?.forEach((cb) => cb());
}

function notifyList() {
  listListeners.forEach((cb) => cb());
}

export function subscribeRow(id: string, cb: () => void) {
  let set = rowListeners.get(id);
  if (!set) {
    set = new Set();
    rowListeners.set(id, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) rowListeners.delete(id);
  };
}

export function getDeal(id: string): Deal | undefined {
  return deals.get(id);
}

/**
 * Applies a patch to a deal by swapping in a new object reference.
 * useSyncExternalStore compares snapshots with Object.is, so mutating a
 * deal's fields in place would leave the reference unchanged and React would
 * never notice the update even though we called notifyRow. Returning a fresh
 * object per patch is what actually triggers the row to re-render.
 */
function patchDeal(id: string, patch: Partial<Deal>): Deal | undefined {
  const current = deals.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  deals.set(id, next);
  return next;
}

export function useDeal(id: string): Deal | undefined {
  return useSyncExternalStore(
    (cb) => subscribeRow(id, cb),
    () => deals.get(id)
  );
}

// ---------------------------------------------------------------------------
// Filters / sort / view order
// ---------------------------------------------------------------------------

export type SortField = "updatedAt" | "stageAge" | "amount" | "company" | "createdAt";

export interface Filters {
  stage: Stage | "all";
  owner: string | "all";
  search: string;
}

let filters: Filters = { stage: "all", owner: "all", search: "" };
let sort: { field: SortField; dir: "asc" | "desc" } = { field: "stageAge", dir: "desc" };

let filteredIds: string[] = allIds.slice();
recomputeView();

function stageAgeDays(d: Deal): number {
  return (Date.now() - d.stageChangedAt) / 86_400_000;
}

function recomputeView() {
  const q = filters.search.trim().toLowerCase();
  let ids = allIds;
  if (filters.stage !== "all" || filters.owner !== "all" || q) {
    ids = allIds.filter((id) => {
      const d = deals.get(id)!;
      if (filters.stage !== "all" && d.stage !== filters.stage) return false;
      if (filters.owner !== "all" && d.owner !== filters.owner) return false;
      if (q && !d.company.toLowerCase().includes(q)) return false;
      return true;
    });
  } else {
    ids = ids.slice();
  }

  const dir = sort.dir === "asc" ? 1 : -1;
  ids.sort((a, b) => {
    const da = deals.get(a)!;
    const db = deals.get(b)!;
    let va: number | string, vb: number | string;
    switch (sort.field) {
      case "amount":
        va = da.amount;
        vb = db.amount;
        break;
      case "company":
        va = da.company;
        vb = db.company;
        break;
      case "stageAge":
        va = stageAgeDays(da);
        vb = stageAgeDays(db);
        break;
      case "createdAt":
        va = da.createdAt;
        vb = db.createdAt;
        break;
      default:
        va = da.updatedAt;
        vb = db.updatedAt;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  filteredIds = ids;
  notifyList();
}

export function getFilteredIds(): string[] {
  return filteredIds;
}

export function useFilteredIds(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listListeners.add(cb);
      return () => listListeners.delete(cb);
    },
    () => filteredIds
  );
}

export function getFilters() {
  return filters;
}

export function useFilters(): Filters {
  return useSyncExternalStore(
    (cb) => {
      listListeners.add(cb);
      return () => listListeners.delete(cb);
    },
    () => filters
  );
}

export function setFilters(patch: Partial<Filters>) {
  filters = { ...filters, ...patch };
  clearSelection();
  recomputeView();
}

export function getSort() {
  return sort;
}

export function useSort(): { field: SortField; dir: "asc" | "desc" } {
  return useSyncExternalStore(
    (cb) => {
      listListeners.add(cb);
      return () => listListeners.delete(cb);
    },
    () => sort
  );
}

export function setSort(field: SortField) {
  if (sort.field === field) {
    sort = { field, dir: sort.dir === "asc" ? "desc" : "asc" };
  } else {
    sort = { field, dir: field === "company" ? "asc" : "desc" };
  }
  recomputeView();
}

// Note: we intentionally do NOT re-run recomputeView() when a deal is edited
// (locally or by a teammate). Re-sorting live would yank rows out from under
// whoever is looking at or selecting them. The view order only changes when
// the user changes a filter/sort/search, or explicitly refreshes.
export function refreshView() {
  recomputeView();
}

// ---------------------------------------------------------------------------
// Selection + keyboard cursor
// ---------------------------------------------------------------------------

let selection = new Set<string>();
let activeId: string | null = allIds[0] ?? null;
let anchorId: string | null = null; // for shift-range selection

export function useSelection(): Set<string> {
  return useSyncExternalStore(
    (cb) => {
      listListeners.add(cb);
      return () => listListeners.delete(cb);
    },
    () => selection
  );
}

export function useActiveId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listListeners.add(cb);
      return () => listListeners.delete(cb);
    },
    () => activeId
  );
}

export function getSelection() {
  return selection;
}

export function getActiveId() {
  return activeId;
}

export function setActiveId(id: string | null) {
  activeId = id;
  notifyList();
}

export function clearSelection() {
  if (selection.size === 0) return;
  selection = new Set();
  anchorId = null;
  notifyList();
}

export function toggleSelect(id: string) {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selection = next;
  anchorId = id;
  notifyList();
}

export function selectRangeTo(id: string) {
  const ids = filteredIds;
  const from = anchorId ?? id;
  const i1 = ids.indexOf(from);
  const i2 = ids.indexOf(id);
  const next = new Set(selection);
  if (i1 === -1 || i2 === -1) {
    next.add(id);
    selection = next;
    notifyList();
    return;
  }
  const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
  for (let i = lo; i <= hi; i++) next.add(ids[i]);
  selection = next;
  notifyList();
}

export function selectAllFiltered() {
  selection = new Set(filteredIds);
  notifyList();
}

export function moveActiveBy(delta: number, extend: boolean) {
  const ids = filteredIds;
  if (ids.length === 0) return;
  let idx = activeId ? ids.indexOf(activeId) : -1;
  if (idx === -1) idx = 0;
  else idx = Math.min(ids.length - 1, Math.max(0, idx + delta));
  const id = ids[idx];
  activeId = id;
  if (extend) {
    if (!anchorId) anchorId = ids[Math.max(0, idx - delta)];
    selectRangeTo(id);
  } else {
    notifyList();
  }
}

// ---------------------------------------------------------------------------
// Mutation queue: optimistic update + retry-able background save with a
// concurrency cap so a bulk move of thousands doesn't fire 5,000 requests
// simultaneously.
// ---------------------------------------------------------------------------

interface QueueItem {
  id: string;
  patch: Partial<Pick<Deal, "stage" | "owner">>;
  attempt: number;
}

const queue: QueueItem[] = [];
let activeSaves = 0;

let savingCount = 0;
const savingListeners = new Set<() => void>();

function notifySaving() {
  savingListeners.forEach((cb) => cb());
}

export function useSavingCount(): number {
  return useSyncExternalStore(
    (cb) => {
      savingListeners.add(cb);
      return () => savingListeners.delete(cb);
    },
    () => savingCount
  );
}

let activity: { id: string; message: string; time: number }[] = [];
const activityListeners = new Set<() => void>();

export function useActivity() {
  return useSyncExternalStore(
    (cb) => {
      activityListeners.add(cb);
      return () => activityListeners.delete(cb);
    },
    () => activity
  );
}

function pushActivity(message: string) {
  activity = [{ id: `${Date.now()}-${Math.random()}`, message, time: Date.now() }, ...activity].slice(0, 20);
  activityListeners.forEach((cb) => cb());
}

function pump() {
  while (activeSaves < MAX_CONCURRENT_SAVES && queue.length > 0) {
    const item = queue.shift()!;
    const deal = deals.get(item.id);
    if (!deal) continue;
    activeSaves++;
    patchDeal(item.id, { syncStatus: "saving" });
    notifyRow(item.id);
    updateDealRemote(item.id, item.patch)
      .then(() => {
        const d = deals.get(item.id);
        if (d) {
          patchDeal(item.id, { syncStatus: "idle", lastError: undefined, retryCount: 0 });
          notifyRow(item.id);
          savingCount--;
          notifySaving();
        }
      })
      .catch((err: Error) => {
        const d = deals.get(item.id);
        if (!d) return;
        if (item.attempt < 2) {
          // automatic retry with backoff, transparent to the user
          setTimeout(() => {
            queue.push({ ...item, attempt: item.attempt + 1 });
            pump();
          }, 400 * Math.pow(2, item.attempt));
        } else {
          patchDeal(item.id, { syncStatus: "error", lastError: err.message, retryCount: item.attempt + 1 });
          notifyRow(item.id);
          errorCount++;
          notifyCount();
          savingCount--;
          notifySaving();
          pushActivity(`Failed to save "${d.company}" → ${item.patch.stage ?? item.patch.owner}`);
        }
      })
      .finally(() => {
        activeSaves--;
        pump();
      });
  }
}

export function moveDeals(ids: string[], stage: Stage) {
  const now = Date.now();
  for (const id of ids) {
    const d = deals.get(id);
    if (!d || d.stage === stage) continue;
    if (d.syncStatus === "error") {
      errorCount--;
      notifyCount();
    }
    if (d.syncStatus !== "saving") {
      savingCount++;
      notifySaving();
    }
    const before = d;
    const after = patchDeal(id, {
      stage,
      stageChangedAt: now,
      updatedAt: now,
      syncStatus: "saving",
      lastError: undefined,
    })!;
    updateStatsForChange(before, after);
    notifyRow(id);
    queue.push({ id, patch: { stage }, attempt: 0 });
  }
  pushActivity(`Moved ${ids.length} deal${ids.length === 1 ? "" : "s"} → ${stage}`);
  pump();
}

export function retryDeal(id: string) {
  const d = deals.get(id);
  if (!d) return;
  if (d.syncStatus === "error") {
    errorCount--;
    notifyCount();
  }
  if (d.syncStatus !== "saving") {
    savingCount++;
    notifySaving();
  }
  patchDeal(id, { syncStatus: "saving" });
  notifyRow(id);
  queue.push({ id, patch: { stage: d.stage, owner: d.owner }, attempt: 0 });
  pump();
}

export function retryAllFailed() {
  const failedIds = allIds.filter((id) => deals.get(id)!.syncStatus === "error");
  failedIds.forEach((id) => retryDeal(id));
  return failedIds.length;
}

let errorCount = 0;
const countListeners = new Set<() => void>();

function notifyCount() {
  countListeners.forEach((cb) => cb());
}

export function useFailedCount(): number {
  return useSyncExternalStore(
    (cb) => {
      countListeners.add(cb);
      return () => countListeners.delete(cb);
    },
    () => errorCount
  );
}

// ---------------------------------------------------------------------------
// Simulated teammates editing the same pipeline concurrently
// ---------------------------------------------------------------------------

export function startTeammateSimulation() {
  return subscribeTeammateChanges(allIds, (changes: TeammateChange[]) => {
    for (const { id, patch } of changes) {
      const d = deals.get(id);
      if (!d) continue;
      // Local edits win: don't let a simulated teammate clobber a save the
      // user just made that hasn't confirmed yet.
      if (d.syncStatus === "saving") continue;
      const now = Date.now();
      const before = d;
      const after = patchDeal(id, {
        ...patch,
        updatedAt: now,
        remoteFlashAt: now,
        ...(patch.stage ? { stageChangedAt: now } : {}),
      })!;
      updateStatsForChange(before, after);
      notifyRow(id);
    }
  });
}

export function getTotalCount() {
  return allIds.length;
}

if (import.meta.env.DEV) {
  (window as any).__pipelineDebug = {
    deals,
    allIds,
    getErrorCount: () => errorCount,
    countActualErrors: () => allIds.filter((id) => deals.get(id)!.syncStatus === "error").length,
    countActualSaving: () => allIds.filter((id) => deals.get(id)!.syncStatus === "saving").length,
    getSavingCount: () => savingCount,
    queueLength: () => queue.length,
    activeSaves: () => activeSaves,
  };
}
