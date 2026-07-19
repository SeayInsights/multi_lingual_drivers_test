/**
 * Backup — export/import all on-device data as a portable JSON file. Since the
 * app has no accounts and stores everything locally, this is how a user moves
 * their history and settings to a new device or keeps a safety copy.
 *
 * Envelope: { schema:"mldt-backup", version, exportedAt, stores:{ answer_events, settings, srs_state } }
 */
import { getAllFrom, withStore } from "./db.js";

const SCHEMA = "mldt-backup";
const VERSION = 1;

/** Read every store into a versioned, serializable backup object. */
export async function exportBackup({ now = Date.now() } = {}) {
  const [answer_events, settings, srs_state] = await Promise.all([
    getAllFrom("answer_events"),
    getAllFrom("settings"),
    getAllFrom("srs_state"),
  ]);
  return { schema: SCHEMA, version: VERSION, exportedAt: now, stores: { answer_events, settings, srs_state } };
}

/** A downloadable Blob for a backup object. */
export function backupToBlob(backup) {
  return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
}

/** A stable, dated filename for a downloaded backup. */
export function backupFilename(backup) {
  const d = new Date(backup?.exportedAt ?? Date.now()).toISOString().slice(0, 10);
  return `driver-practice-backup-${d}.json`;
}

/**
 * Restore from a parsed backup object. Answer events merge by id (no
 * duplicates, so restoring never loses existing history); settings and SRS
 * state are overwritten by the imported values (restore semantics).
 * Returns counts of records written. Throws on a malformed file.
 */
export async function importBackup(data) {
  if (!data || typeof data !== "object" || data.schema !== SCHEMA || typeof data.version !== "number" || !data.stores || typeof data.stores !== "object") {
    throw new Error("invalid-backup");
  }
  if (data.version > VERSION) throw new Error("backup-too-new");
  const s = data.stores;
  const counts = { answer_events: 0, settings: 0, srs_state: 0 };

  const existingIds = new Set((await getAllFrom("answer_events")).map((e) => e.id));
  for (const e of Array.isArray(s.answer_events) ? s.answer_events : []) {
    if (e && typeof e.id === "string" && !existingIds.has(e.id)) {
      await withStore("answer_events", "readwrite", (store) => store.put(e));
      existingIds.add(e.id);
      counts.answer_events++;
    }
  }
  for (const r of Array.isArray(s.settings) ? s.settings : []) {
    if (r && r.key !== undefined) {
      await withStore("settings", "readwrite", (store) => store.put(r));
      counts.settings++;
    }
  }
  for (const r of Array.isArray(s.srs_state) ? s.srs_state : []) {
    if (r && r.questionId !== undefined) {
      await withStore("srs_state", "readwrite", (store) => store.put(r));
      counts.srs_state++;
    }
  }
  return counts;
}

/** Parse a File/text into a backup object (throws on bad JSON or envelope). */
export async function parseBackupText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("invalid-backup");
  }
  return data;
}
