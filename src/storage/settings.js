/**
 * Settings store — IndexedDB-backed with in-memory cache and change events.
 *
 * Boot-critical keys (theme, textSize, languageMode) are write-through mirrored
 * to localStorage under the same 'mldt.settings.*' names the shell reads
 * synchronously before IndexedDB opens — no flash of wrong theme/size.
 */
import { withStore, getAllFrom } from "./db.js";

const LS_PREFIX = "mldt.settings.";
const BOOT_KEYS = new Set(["theme", "textSize", "languageMode"]);

const cache = new Map();
const emitter = new EventTarget();
let loaded = false;

export async function initSettings() {
  if (loaded) return;
  // Adopt any pre-existing localStorage values (set by the shell before this
  // layer existed), then load IDB — IDB wins when both exist.
  for (const key of BOOT_KEYS) {
    const v = localStorage.getItem(LS_PREFIX + key);
    if (v !== null && !cache.has(key)) cache.set(key, v);
  }
  for (const row of await getAllFrom("settings")) cache.set(row.key, row.value);
  loaded = true;
}

export function getSetting(key, fallback = null) {
  return cache.has(key) ? cache.get(key) : fallback;
}

export async function setSetting(key, value) {
  cache.set(key, value);
  if (BOOT_KEYS.has(key)) localStorage.setItem(LS_PREFIX + key, String(value));
  await withStore("settings", "readwrite", (store) => store.put({ key, value }));
  emitter.dispatchEvent(new CustomEvent("change", { detail: { key, value } }));
}

/** Subscribe to changes; returns an unsubscribe function. */
export function onSettingChange(handler) {
  const fn = (e) => handler(e.detail.key, e.detail.value);
  emitter.addEventListener("change", fn);
  return () => emitter.removeEventListener("change", fn);
}

/**
 * One-time migration of the legacy Ohio quiz best score
 * (localStorage 'ohioBest' = JSON like {score, total, date}).
 * Stored under 'legacyBestScore'; the original key is left untouched so the
 * old page keeps working if someone still opens it.
 */
export async function migrateLegacyBestScore() {
  if (getSetting("legacyBestScore") !== null) return false; // already migrated
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem("ohioBest") ?? "null");
  } catch {
    return false;
  }
  if (legacy === null) return false;
  await setSetting("legacyBestScore", legacy);
  return true;
}
