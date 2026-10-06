import { Deal } from "../types";

const DB_NAME = "pipeline4sales";
const DB_VERSION = 1;
const STORE = "deals";

const hasIndexedDB = typeof indexedDB !== "undefined";

// Memoized: every caller shares one connection instead of racing separate
// indexedDB.open() calls (which, on the very first load before the database
// exists, can otherwise contend with each other over the upgrade transaction
// and silently drop a concurrent write).
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

/** Returns the persisted deals from a previous session, or [] if there are none (or IndexedDB isn't available). */
export async function loadPersistedDeals(): Promise<Deal[]> {
  if (!hasIndexedDB) return [];
  try {
    const db = await openDB();
    return await new Promise<Deal[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as Deal[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    if (import.meta.env.DEV) console.error("loadPersistedDeals failed", err);
    return [];
  }
}

/** Upserts a batch of deals in a single transaction. Best-effort: local persistence never blocks the UI. */
export async function persistDeals(deals: Deal[]): Promise<void> {
  if (!hasIndexedDB || deals.length === 0) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const d of deals) store.put(d);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Local persistence is a nice-to-have, not a correctness requirement — swallow
    // in production, but surface it in dev so a real bug doesn't look like "it
    // just didn't save" with no trace.
    if (import.meta.env.DEV) console.error("persistDeals failed", err);
  }
}

/**
 * Closes the shared connection, if one is open. The app itself never needs
 * this (the connection just lives for the page's lifetime), but tests that
 * repeatedly create and delete the database in the same process do: an
 * IndexedDB connection left open blocks a subsequent deleteDatabase() call
 * indefinitely (it fires "blocked", not "success"), which otherwise
 * deadlocks a test suite that resets between cases.
 */
export async function closeDB(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

/** Wipes all persisted deals (used by "Reset demo data"). */
export async function clearPersistedDeals(): Promise<void> {
  if (!hasIndexedDB) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
