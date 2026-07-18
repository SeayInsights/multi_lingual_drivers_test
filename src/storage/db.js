/**
 * IndexedDB wrapper — versioned migrations, three stores:
 *   answer_events : the day-one answer log (milestone-7 reflection reads this)
 *   settings      : key/value app settings
 *   srs_state     : reserved for the milestone-2 spaced-repetition engine
 *
 * Design: plain promises over raw IDB (no dependency), one shared connection,
 * migrations keyed off oldVersion so upgrades compose forward forever.
 */
const DB_NAME = "mldt";
const DB_VERSION = 1;

let dbPromise = null;

/** Migration list: index = fromVersion. Each runs inside onupgradeneeded. */
const MIGRATIONS = [
  // 0 -> 1: initial schema
  (db) => {
    const events = db.createObjectStore("answer_events", { keyPath: "id" });
    events.createIndex("by_ts", "ts");
    events.createIndex("by_question", "questionId");
    events.createIndex("by_session", "sessionId");
    events.createIndex("by_mode", "mode");
    db.createObjectStore("settings", { keyPath: "key" });
    db.createObjectStore("srs_state", { keyPath: "questionId" });
  },
];

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (let v = e.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v]?.(db);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  });
  return dbPromise;
}

/** Run fn(store) in a transaction; resolves with fn's request result. */
export async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      const maybeReq = fn(store);
      if (maybeReq && typeof maybeReq.onsuccess !== "undefined") {
        maybeReq.onsuccess = () => (result = maybeReq.result);
      } else {
        result = maybeReq;
      }
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

/** Collect every record matched by an index range (or whole store). */
export async function getAllFrom(storeName, { index, range, limit } = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const source = index ? tx.objectStore(storeName).index(index) : tx.objectStore(storeName);
    const req = source.getAll(range ?? null, limit);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
