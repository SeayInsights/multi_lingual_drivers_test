/**
 * State picker behavioral tests (M4 WO 77f4bcf3): the picker renders only
 * 'available' registry states, marks the current one, persists a switch and
 * reloads; draft states are invisible.
 * Run: node --test tests/state-picker.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const dom = new JSDOM(
  `<!DOCTYPE html><html lang="vi"><body>
     <a class="route" href="#/state" data-state-name="upper">US • 50 STATES</a>
     <main id="view"></main>
   </body></html>`,
  { url: "http://localhost/" }
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;

// location stub: state.js only calls location.reload() on switch
let reloads = 0;
globalThis.location = { reload: () => { reloads++; }, hash: "" };

const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};

// fetch: serve repo files, but swap the states registry for a fixture with
// one available state beyond Ohio plus one draft (must never render)
const FIXTURE_REGISTRY = {
  version: 2,
  states: [
    { code: "oh", name: { "en-US": "Ohio", "vi-VN": "Ohio" }, status: "available" },
    { code: "ca", name: { "en-US": "California", "vi-VN": "California" }, status: "available" },
    { code: "zz", name: { "en-US": "Draftland", "vi-VN": "Draftland" }, status: "draft" },
  ],
};
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "");
  if (rel === "data/states/index.json") {
    return { ok: true, status: 200, json: async () => structuredClone(FIXTURE_REGISTRY) };
  }
  try {
    const body = await readFile(join(ROOT, rel), "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  }
};

// fake-indexeddb/auto attaches to `window` when one exists (our jsdom) —
// mirror it onto globalThis where src/storage/db.js resolves bare identifiers
await import("fake-indexeddb/auto");
if (!globalThis.indexedDB && globalThis.window?.indexedDB) {
  globalThis.indexedDB = globalThis.window.indexedDB;
  globalThis.IDBKeyRange = globalThis.window.IDBKeyRange;
}

const { initI18n } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const { initSettings, getSetting } = await import("../src/storage/settings.js");
await initSettings();
const { stateView, availableStates, fillStateLabels } = await import("../src/pages/state/state.js");

const flush = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("until(): condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
};

test("availableStates filters drafts and sorts A-Z by name", () => {
  const codes = availableStates(FIXTURE_REGISTRY).map((s) => s.code);
  assert.deepEqual(codes, ["ca", "oh"], "California before Ohio");
});

test("picker renders available states A-Z, current marked, draft hidden", async () => {
  document.getElementById("view").innerHTML = stateView();
  await flush();
  const root = document.getElementById("state-root");
  const buttons = [...root.querySelectorAll("[data-state-pick]")];
  assert.deepEqual(buttons.map((b) => b.dataset.statePick), ["ca", "oh"], "sorted A-Z");
  assert.equal(root.querySelector('[data-state-pick="zz"]'), null, "draft state must not render");
  assert.ok(root.querySelector("#state-search"), "search box present");
  const oh = root.querySelector('[data-state-pick="oh"]');
  const ca = root.querySelector('[data-state-pick="ca"]');
  assert.equal(oh.getAttribute("aria-checked"), "true", "oh is the default current state");
  assert.equal(ca.getAttribute("aria-checked"), "false");
});

test("search filters the state list (diacritic-insensitive)", async () => {
  const input = document.getElementById("state-search");
  input.value = "cali";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await flush();
  const shown = [...document.querySelectorAll("[data-state-pick]")].map((b) => b.dataset.statePick);
  assert.deepEqual(shown, ["ca"], "only California matches 'cali'");
  input.value = "";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await flush();
  assert.equal(document.querySelectorAll("[data-state-pick]").length, 2, "cleared search restores all");
});

test("tapping the current state is a no-op", async () => {
  const before = reloads;
  document.querySelector('[data-state-pick="oh"]').click();
  await flush();
  assert.equal(reloads, before, "no reload for the already-current state");
  assert.equal(getSetting("state", "oh"), "oh");
});

test("tapping another state persists the setting and reloads", async () => {
  document.querySelector('[data-state-pick="ca"]').click();
  await until(() => reloads === 1);
  assert.equal(getSetting("state"), "ca", "setting persisted");
  assert.equal(reloads, 1, "app reloads for a clean-slate switch");
});

test("fillStateLabels fills the header chip with the current state", async () => {
  await fillStateLabels(document);
  assert.equal(document.querySelector("[data-state-name]").textContent, "CALIFORNIA");
});
