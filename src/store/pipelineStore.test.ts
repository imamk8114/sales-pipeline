import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PipelineStore from "./pipelineStore";
import type * as FakeApi from "../api/fakeApi";

// pipelineStore is a singleton module by design (one shared pipeline for the
// whole app) — generated data, selection, the save queue, etc. all live as
// module-level state. That's the right call for the app itself, but it means
// tests need a *fresh* module instance each time, or state would leak across
// tests. vi.resetModules() + a dynamic re-import gives each test its own
// isolated "pipeline" (fresh 50k-deal seed, empty selection, empty queue).
async function freshStore(): Promise<{ store: typeof PipelineStore; fakeApi: typeof FakeApi }> {
  vi.resetModules();
  const fakeApi = await import("../api/fakeApi");
  const store = await import("./pipelineStore");
  return { store, fakeApi };
}

describe("pipelineStore: initial state", () => {
  it("loads all 50,000 generated deals into the default (unfiltered) view", async () => {
    const { store } = await freshStore();
    expect(store.getTotalCount()).toBe(50_000);
    expect(store.getFilteredIds()).toHaveLength(50_000);
  });

  it("defaults to sorting by longest-in-stage first, descending", async () => {
    const { store } = await freshStore();
    expect(store.getSort()).toEqual({ field: "stageAge", dir: "desc" });
  });
});

describe("pipelineStore: selection", () => {
  it("toggleSelect adds then removes a single id", async () => {
    const { store } = await freshStore();
    const id = store.getFilteredIds()[0];
    store.toggleSelect(id);
    expect(store.getSelection().has(id)).toBe(true);
    store.toggleSelect(id);
    expect(store.getSelection().has(id)).toBe(false);
  });

  it("selectRangeTo selects a contiguous range regardless of click direction", async () => {
    const { store } = await freshStore();
    const ids = store.getFilteredIds();
    store.toggleSelect(ids[5]); // anchor
    store.selectRangeTo(ids[2]); // click upward — range should still be 2..5 inclusive
    const selected = store.getSelection();
    expect(selected.size).toBe(4);
    for (const id of ids.slice(2, 6)) expect(selected.has(id)).toBe(true);
  });

  it("selectAllFiltered selects exactly the current view, not the whole dataset", async () => {
    const { store } = await freshStore();
    store.setFilters({ stage: "Won" });
    const wonIds = store.getFilteredIds();
    expect(wonIds.length).toBeGreaterThan(0);
    expect(wonIds.length).toBeLessThan(50_000);

    store.selectAllFiltered();
    expect(store.getSelection().size).toBe(wonIds.length);
    for (const id of wonIds) expect(store.getSelection().has(id)).toBe(true);
  });

  it("clearSelection empties the selection", async () => {
    const { store } = await freshStore();
    store.selectAllFiltered();
    expect(store.getSelection().size).toBeGreaterThan(0);
    store.clearSelection();
    expect(store.getSelection().size).toBe(0);
  });

  it("changing a filter clears the selection (the invariant the header select-all checkbox relies on)", async () => {
    const { store } = await freshStore();
    store.selectAllFiltered();
    expect(store.getSelection().size).toBe(50_000);
    store.setFilters({ stage: "Won" });
    expect(store.getSelection().size).toBe(0);
  });

  it("moveActiveBy advances the cursor and, when extending, grows the selection", async () => {
    const { store } = await freshStore();
    const ids = store.getFilteredIds();
    store.setActiveId(ids[0]);
    store.moveActiveBy(1, false);
    expect(store.getActiveId()).toBe(ids[1]);
    expect(store.getSelection().size).toBe(0);

    store.moveActiveBy(1, true); // shift+down: extend selection
    expect(store.getActiveId()).toBe(ids[2]);
    expect(store.getSelection().has(ids[1])).toBe(true);
    expect(store.getSelection().has(ids[2])).toBe(true);
  });
});

describe("pipelineStore: filters", () => {
  it("stage filter narrows the view to exactly that stage", async () => {
    const { store } = await freshStore();
    store.setFilters({ stage: "Negotiation" });
    const ids = store.getFilteredIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(store.getDeal(id)!.stage).toBe("Negotiation");
  });

  it("owner filter narrows the view to exactly that owner", async () => {
    const { store } = await freshStore();
    const owner = store.OWNERS_FOR_FILTER[0];
    store.setFilters({ owner });
    const ids = store.getFilteredIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(store.getDeal(id)!.owner).toBe(owner);
  });

  it("search matches company name case-insensitively", async () => {
    const { store } = await freshStore();
    const target = store.getDeal(store.getFilteredIds()[0])!;
    const needle = target.company.slice(0, 5).toUpperCase();
    store.setFilters({ search: needle });
    const ids = store.getFilteredIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(store.getDeal(id)!.company.toLowerCase()).toContain(needle.toLowerCase());
    }
  });

  it("failedOnly shows exactly the deals whose last save failed", async () => {
    const { store, fakeApi } = await freshStore();
    vi.useFakeTimers();
    fakeApi.setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });

    const failingId = store.getFilteredIds()[0];
    store.moveDeals([failingId], "Won");
    // two auto-retries with 400ms/800ms backoff before it's finally marked failed
    await vi.advanceTimersByTimeAsync(0 + 400 + 0 + 800 + 0 + 10);

    expect(store.getDeal(failingId)!.syncStatus).toBe("error");

    store.viewFailedDeals();
    const filters = store.getFilters();
    expect(filters.failedOnly).toBe(true);
    expect(filters.stage).toBe("all");
    const ids = store.getFilteredIds();
    expect(ids).toEqual([failingId]);

    vi.useRealTimers();
  });
});

describe("pipelineStore: sort", () => {
  it("clicking the same field twice flips direction", async () => {
    const { store } = await freshStore();
    store.setSort("amount");
    expect(store.getSort()).toEqual({ field: "amount", dir: "desc" });
    store.setSort("amount");
    expect(store.getSort()).toEqual({ field: "amount", dir: "asc" });
  });

  it("switching to a new field resets direction (asc for company, desc otherwise)", async () => {
    const { store } = await freshStore();
    store.setSort("amount");
    store.setSort("company");
    expect(store.getSort()).toEqual({ field: "company", dir: "asc" });
    store.setSort("createdAt");
    expect(store.getSort()).toEqual({ field: "createdAt", dir: "desc" });
  });

  it("actually orders the rows by the chosen field/direction", async () => {
    const { store } = await freshStore();
    store.setSort("amount"); // desc
    const ids = store.getFilteredIds();
    const amounts = ids.slice(0, 50).map((id) => store.getDeal(id)!.amount);
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeLessThanOrEqual(amounts[i - 1]);
    }
  });
});

describe("pipelineStore: moveDeals + save queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies the stage change optimistically and immediately, before any save resolves", async () => {
    const { store, fakeApi } = await freshStore();
    fakeApi.setApiConfig({ minLatencyMs: 10_000, maxLatencyMs: 10_000, failRate: 0 });
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Won")!;

    store.moveDeals([id], "Won");

    const deal = store.getDeal(id)!;
    expect(deal.stage).toBe("Won"); // changed synchronously, no await needed
    expect(deal.syncStatus).toBe("saving");
    expect(deal.version).toBe(1);
  });

  it("resolves to idle on a successful save", async () => {
    const { store, fakeApi } = await freshStore();
    fakeApi.setApiConfig({ minLatencyMs: 10, maxLatencyMs: 10, failRate: 0 });
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Won")!;

    store.moveDeals([id], "Won");
    await vi.advanceTimersByTimeAsync(20);

    const deal = store.getDeal(id)!;
    expect(deal.stage).toBe("Won");
    expect(deal.syncStatus).toBe("idle");
    expect(deal.lastError).toBeUndefined();
  });

  it("retries twice with backoff before marking a persistently-failing save as error", async () => {
    const { store, fakeApi } = await freshStore();
    fakeApi.setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Won")!;

    store.moveDeals([id], "Won");

    // Still mid-retry partway through the backoff window.
    await vi.advanceTimersByTimeAsync(10);
    expect(store.getDeal(id)!.syncStatus).toBe("saving");

    // 0ms latency + 400ms + 800ms backoff, with slack.
    await vi.advanceTimersByTimeAsync(400 + 800 + 10);

    const deal = store.getDeal(id)!;
    expect(deal.syncStatus).toBe("error");
    expect(deal.lastError).toBeTruthy();
    expect(deal.retryCount).toBe(3); // the 2 retries plus the original attempt
  });

  it("keeps the optimistic value visible even after the save ultimately fails", async () => {
    const { store, fakeApi } = await freshStore();
    fakeApi.setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Lost")!;

    store.moveDeals([id], "Lost");
    await vi.advanceTimersByTimeAsync(400 + 800 + 50);

    // Per the "never revert" decision: a failed save still shows the move the
    // rep made, not a snap-back to the old stage.
    expect(store.getDeal(id)!.stage).toBe("Lost");
  });

  it("never runs more than the concurrency cap worth of saves at once", async () => {
    const { store, fakeApi } = await freshStore();
    fakeApi.setApiConfig({ minLatencyMs: 50, maxLatencyMs: 50, failRate: 0 });
    const ids = store.getFilteredIds().slice(0, 40);

    store.moveDeals(ids, "Negotiation");
    await vi.advanceTimersByTimeAsync(1); // let the queue start draining

    const debug = (window as any).__pipelineDebug;
    expect(debug).toBeTruthy();
    expect(debug.activeSaves()).toBeLessThanOrEqual(6);
    expect(debug.activeSaves()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5000); // drain the rest
    expect(debug.queueLength()).toBe(0);
    expect(debug.activeSaves()).toBe(0);
  });

  it("retryAllFailed only retries deals currently in the error state", async () => {
    const { store, fakeApi } = await freshStore();
    fakeApi.setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });
    const ids = store
      .getFilteredIds()
      .filter((i) => store.getDeal(i)!.stage !== "Won")
      .slice(0, 3);
    store.moveDeals(ids, "Won");
    await vi.advanceTimersByTimeAsync(400 + 800 + 50);
    for (const id of ids) expect(store.getDeal(id)!.syncStatus).toBe("error");

    fakeApi.setApiConfig({ failRate: 0 });
    const retried = store.retryAllFailed();
    expect(retried).toBe(3);
    await vi.advanceTimersByTimeAsync(50);

    for (const id of ids) {
      expect(store.getDeal(id)!.syncStatus).toBe("idle");
    }
  });
});

describe("pipelineStore: stale-save version guard (regression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a slow, now-stale save response never clobbers a newer edit to the same deal", async () => {
    const { store, fakeApi } = await freshStore();
    // Picked explicitly so neither move below is a same-stage no-op.
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage === "New Lead")!;

    // First move: slow but will eventually succeed.
    fakeApi.setApiConfig({ minLatencyMs: 1000, maxLatencyMs: 1000, failRate: 0 });
    store.moveDeals([id], "Contacted");
    expect(store.getDeal(id)!.version).toBe(1);

    // Before that first save resolves, the user (or a retry) moves it again —
    // a faster, different save that should "win".
    await vi.advanceTimersByTimeAsync(100);
    fakeApi.setApiConfig({ minLatencyMs: 10, maxLatencyMs: 10, failRate: 0 });
    store.moveDeals([id], "Negotiation");
    expect(store.getDeal(id)!.version).toBe(2);

    // Let the fast (second) save resolve first.
    await vi.advanceTimersByTimeAsync(20);
    expect(store.getDeal(id)!.stage).toBe("Negotiation");
    expect(store.getDeal(id)!.syncStatus).toBe("idle");

    // Now let the slow (first, stale) save finally resolve. Without the
    // version guard this used to flip syncStatus back to idle (harmless here)
    // but — critically — in the failure path it would mark a deal "error" for
    // a save the app no longer considers current. Confirm it's a no-op.
    await vi.advanceTimersByTimeAsync(1000);
    const deal = store.getDeal(id)!;
    expect(deal.stage).toBe("Negotiation"); // untouched by the stale response
    expect(deal.syncStatus).toBe("idle");
    expect(deal.version).toBe(2); // not bumped again by the stale save
  });

  it("a stale save that ultimately fails does not mark a since-superseded deal as error", async () => {
    const { store, fakeApi } = await freshStore();
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage === "New Lead")!;

    // First move: slow, and will fail.
    fakeApi.setApiConfig({ minLatencyMs: 1000, maxLatencyMs: 1000, failRate: 1 });
    store.moveDeals([id], "Contacted");

    // Superseded quickly by a fast, successful second move.
    await vi.advanceTimersByTimeAsync(50);
    fakeApi.setApiConfig({ minLatencyMs: 10, maxLatencyMs: 10, failRate: 0 });
    store.moveDeals([id], "Negotiation");
    await vi.advanceTimersByTimeAsync(20);
    expect(store.getDeal(id)!.syncStatus).toBe("idle");

    // Let the stale save's full retry chain (backoff included) play out and fail.
    await vi.advanceTimersByTimeAsync(1000 + 400 + 1000 + 800 + 1000 + 100);

    const deal = store.getDeal(id)!;
    expect(deal.stage).toBe("Negotiation");
    expect(deal.syncStatus).toBe("idle"); // not clobbered into "error" by the stale failure
  });
});

describe("pipelineStore: stats", () => {
  it("computes the same totals from scratch as it maintains incrementally", async () => {
    // getStats() returns the incrementally-maintained running total (see
    // updateStatsForChange) — cross-check it against a full scratch scan over
    // every deal, so a bug in the delta math can't silently drift undetected.
    const { store } = await freshStore();
    const stats = store.getStats();

    const expected = { openCount: 0, openValue: 0, stageCounts: {} as Record<string, number> };
    for (const id of store.getFilteredIds()) {
      const d = store.getDeal(id)!;
      expected.stageCounts[d.stage] = (expected.stageCounts[d.stage] ?? 0) + 1;
      if (d.stage !== "Won" && d.stage !== "Lost") {
        expected.openCount++;
        expected.openValue += d.amount;
      }
    }

    expect(stats.totalCount).toBe(50_000);
    expect(stats.openCount).toBe(expected.openCount);
    expect(stats.openValue).toBe(expected.openValue);
    expect(stats.stageCounts).toEqual(expected.stageCounts);
  });

  it("moving a deal out of the open pipeline (into Won) updates openCount/openValue/stageCounts together", async () => {
    const { store } = await freshStore();
    const id = store.getFilteredIds().find((i) => {
      const d = store.getDeal(i)!;
      return d.stage !== "Won" && d.stage !== "Lost";
    })!;
    const deal = store.getDeal(id)!;

    const statsBefore = store.getStats();
    store.moveDeals([id], "Won");
    const statsAfter = store.getStats();

    expect(statsAfter.stageCounts[deal.stage]).toBe(statsBefore.stageCounts[deal.stage] - 1);
    expect(statsAfter.stageCounts.Won).toBe(statsBefore.stageCounts.Won + 1);
    expect(statsAfter.openCount).toBe(statsBefore.openCount - 1);
    expect(statsAfter.openValue).toBe(statsBefore.openValue - deal.amount);
  });

  it("moving a deal between two open stages leaves openCount/openValue unchanged", async () => {
    const { store } = await freshStore();
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage === "New Lead")!;

    const statsBefore = store.getStats();
    store.moveDeals([id], "Contacted");
    const statsAfter = store.getStats();

    expect(statsAfter.openCount).toBe(statsBefore.openCount);
    expect(statsAfter.openValue).toBe(statsBefore.openValue);
    expect(statsAfter.stageCounts["New Lead"]).toBe(statsBefore.stageCounts["New Lead"] - 1);
    expect(statsAfter.stageCounts.Contacted).toBe(statsBefore.stageCounts.Contacted + 1);
  });

  it("moving a stale (at-risk) deal resets its age, decrementing atRiskCount", async () => {
    const { store } = await freshStore();
    const id = store.getFilteredIds().find((i) => {
      const d = store.getDeal(i)!;
      const ageDays = (Date.now() - d.stageChangedAt) / 86_400_000;
      return d.stage !== "Won" && d.stage !== "Lost" && ageDays >= store.AT_RISK_DAYS;
    })!;
    expect(id).toBeDefined();

    const statsBefore = store.getStats();
    store.moveDeals([id], "Negotiation");
    const statsAfter = store.getStats();

    expect(statsAfter.atRiskCount).toBe(statsBefore.atRiskCount - 1);
  });
});
