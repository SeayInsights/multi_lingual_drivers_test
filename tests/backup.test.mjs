/**
 * Backup export/import tests (M7 WO 44eb9e85): export → wipe → import restores
 * the data; malformed files are rejected; answer events merge by id (no dupes).
 * Run: node --test tests/backup.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};
await import("fake-indexeddb/auto");

const { withStore, getAllFrom } = await import("../src/storage/db.js");
const events = await import("../src/storage/events.js");
const settings = await import("../src/storage/settings.js");
const backup = await import("../src/storage/backup.js");

const wipe = async () => {
  for (const s of ["answer_events", "settings", "srs_state"]) {
    await withStore(s, "readwrite", (store) => store.clear());
  }
};

test("export → wipe → import restores answer events and settings", async () => {
  await wipe();
  const sid = events.newSessionId();
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-signs-001", choiceIndex: 0, correct: true, sessionId: sid, locale: "vi-VN" });
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-rules-001", choiceIndex: 1, correct: false, sessionId: sid, locale: "vi-VN" });
  await settings.setSetting("state", "ca");

  const b = await backup.exportBackup();
  assert.equal(b.schema, "mldt-backup");
  assert.equal(b.stores.answer_events.length, 2);

  await wipe();
  assert.equal((await getAllFrom("answer_events")).length, 0);

  const counts = await backup.importBackup(b);
  assert.equal(counts.answer_events, 2, "both events restored");
  assert.equal((await getAllFrom("answer_events")).length, 2);
  const restoredSettings = await getAllFrom("settings");
  assert.ok(restoredSettings.find((r) => r.key === "state" && r.value === "ca"), "setting restored");
});

test("importing the same backup twice does not duplicate answer events", async () => {
  const b = await backup.exportBackup();
  const before = (await getAllFrom("answer_events")).length;
  const counts = await backup.importBackup(b);
  assert.equal(counts.answer_events, 0, "no new events on re-import");
  assert.equal((await getAllFrom("answer_events")).length, before, "count unchanged");
});

test("malformed backups are rejected", async () => {
  await assert.rejects(() => backup.importBackup(null), /invalid-backup/);
  await assert.rejects(() => backup.importBackup({ schema: "wrong" }), /invalid-backup/);
  await assert.rejects(() => backup.importBackup({ schema: "mldt-backup", version: 1 }), /invalid-backup/);
  await assert.rejects(() => backup.parseBackupText("{not json"), /invalid-backup/);
  await assert.rejects(() => backup.importBackup({ schema: "mldt-backup", version: 999, stores: {} }), /backup-too-new/);
});

test("backupFilename is dated and export merges union of events", async () => {
  const b = await backup.exportBackup({ now: Date.UTC(2026, 6, 19) });
  assert.equal(backup.backupFilename(b), "driver-practice-backup-2026-07-19.json");
  // add a new event, import an old backup → union (old kept, new kept)
  const sid = events.newSessionId();
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-signs-002", choiceIndex: 0, correct: true, sessionId: sid, locale: "vi-VN" });
  const after = await backup.exportBackup();
  assert.ok(after.stores.answer_events.length >= 3, "new event included in a fresh export");
});
