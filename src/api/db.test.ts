import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Deal } from "../types";

// fake-indexeddb/auto is imported only in this file (not the shared test
// setup), so it never leaks into pipelineStore's tests, which deliberately
// rely on jsdom's real absence of IndexedDB to exercise the "not available"
// path implicitly. Vitest isolates each test file's module registry by
// default, which is what keeps that assumption safe.

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  const now = Date.now();
  return {
    id: "deal-1",
    company: "Acme Corp",
    amount: 100_000,
    licences: 10,
    owner: "Priya",
    stage: "New Lead",
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    syncStatus: "idle",
    retryCount: 0,
    version: 0,
    ...overrides,
  };
}

/** Fresh module instance + a wiped database, so each test starts clean. */
async function freshDb() {
  // Close whatever connection the previous test's module instance left open —
  // otherwise deleteDatabase() below fires "blocked" instead of "success" and
  // never actually completes, wedging every test after the first.
  try {
    const prev = await import("./db");
    await prev.closeDB();
  } catch {
    // nothing imported yet (first call in the file) — nothing to close
  }

  vi.resetModules();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("pipeline4sales");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  return import("./db");
}

describe("db: round-trip", () => {
  it("returns an empty array when nothing has been persisted yet", async () => {
    const db = await freshDb();
    expect(await db.loadPersistedDeals()).toEqual([]);
  });

  it("round-trips a batch of deals", async () => {
    const db = await freshDb();
    const deals = [makeDeal({ id: "deal-1" }), makeDeal({ id: "deal-2", company: "Globex" })];
    await db.persistDeals(deals);

    const loaded = await db.loadPersistedDeals();
    expect(loaded.map((d) => d.id).sort()).toEqual(["deal-1", "deal-2"]);
    expect(loaded.find((d) => d.id === "deal-2")!.company).toBe("Globex");
  });

  it("persisting the same id again overwrites in place rather than duplicating", async () => {
    const db = await freshDb();
    await db.persistDeals([makeDeal({ id: "deal-1", stage: "New Lead" })]);
    await db.persistDeals([makeDeal({ id: "deal-1", stage: "Won" })]);

    const loaded = await db.loadPersistedDeals();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].stage).toBe("Won");
  });

  it("clearPersistedDeals wipes everything", async () => {
    const db = await freshDb();
    await db.persistDeals([makeDeal()]);
    expect(await db.loadPersistedDeals()).toHaveLength(1);

    await db.clearPersistedDeals();
    expect(await db.loadPersistedDeals()).toEqual([]);
  });

  it("persistDeals with an empty batch is a no-op", async () => {
    const db = await freshDb();
    await db.persistDeals([makeDeal({ id: "deal-1" })]);
    await db.persistDeals([]);
    expect(await db.loadPersistedDeals()).toHaveLength(1);
  });
});

describe("db: closeDB", () => {
  it("is a safe no-op when nothing has opened a connection yet", async () => {
    const db = await freshDb();
    await expect(db.closeDB()).resolves.toBeUndefined();
  });

  it("is safe to call twice in a row", async () => {
    const db = await freshDb();
    await db.persistDeals([makeDeal()]); // opens the connection
    await db.closeDB();
    await expect(db.closeDB()).resolves.toBeUndefined();
  });

  it("a later call still works after closing (reopens transparently)", async () => {
    const db = await freshDb();
    await db.persistDeals([makeDeal({ id: "deal-1" })]);
    await db.closeDB();

    const loaded = await db.loadPersistedDeals();
    expect(loaded).toHaveLength(1);
  });
});

describe("db: connection-sharing regression", () => {
  it("a write that races a read on a brand-new database still fully lands", async () => {
    // Regression test for a real bug hit while building this: loadPersistedDeals
    // and persistDeals each used to open their own indexedDB connection. On the
    // very first run, before the database exists, two concurrent open() calls
    // raced over the upgrade transaction and one side's write silently failed
    // (caught and swallowed) — the initial 50,000-deal seed write dropped to a
    // trickle of ~1 record every couple seconds. openDB() now memoizes a single
    // shared connection so this can't happen; firing a read and a 200-record
    // write at the same instant on a fresh database must not lose the write.
    const db = await freshDb();
    const deals = Array.from({ length: 200 }, (_, i) => makeDeal({ id: `deal-${i}` }));

    await Promise.all([db.loadPersistedDeals(), db.persistDeals(deals)]);

    const finalLoad = await db.loadPersistedDeals();
    expect(finalLoad).toHaveLength(200);
  });
});

describe("db: IndexedDB unavailable", () => {
  it("all three functions resolve harmlessly instead of throwing", async () => {
    vi.resetModules();
    const original = globalThis.indexedDB;
    // @ts-expect-error simulating an environment without IndexedDB
    delete globalThis.indexedDB;

    try {
      const db = await import("./db");
      await expect(db.loadPersistedDeals()).resolves.toEqual([]);
      await expect(db.persistDeals([makeDeal()])).resolves.toBeUndefined();
      await expect(db.clearPersistedDeals()).resolves.toBeUndefined();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
