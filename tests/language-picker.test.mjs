/**
 * Language picker behavioral tests (M6 WO e9bdb5a4): the picker renders
 * available primary languages (excluding the English fallback), marks the
 * current one, persists a switch, and the i18n layer reads the chosen primary.
 * Run: node --test tests/language-picker.test.mjs
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
     <span data-lang-name>?</span><main id="view"></main>
   </body></html>`,
  { url: "http://localhost/" }
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
let reloads = 0;
globalThis.location = { reload: () => { reloads++; }, hash: "" };
const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};

// Fixture registry: two available primaries (vi + es) + English fallback.
const FIXTURE = {
  version: 2,
  fallback: "en-US",
  languages: [
    { tag: "vi-VN", endonym: "Tiếng Việt", englishName: "Vietnamese", status: "available" },
    { tag: "es-MX", endonym: "Español", englishName: "Spanish", status: "available" },
    { tag: "zz-ZZ", endonym: "Draftish", englishName: "Draft", status: "draft" },
    { tag: "en-US", endonym: "English", englishName: "English", status: "available" },
  ],
};
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "");
  if (rel === "locales/index.json") return { ok: true, status: 200, json: async () => structuredClone(FIXTURE) };
  try {
    const body = await readFile(join(ROOT, rel), "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  }
};

await import("fake-indexeddb/auto");
if (!globalThis.indexedDB && globalThis.window?.indexedDB) {
  globalThis.indexedDB = globalThis.window.indexedDB;
  globalThis.IDBKeyRange = globalThis.window.IDBKeyRange;
}

const { initI18n, getPrimaryLang } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const { initSettings } = await import("../src/storage/settings.js");
await initSettings();
const { languageView, primaryLanguages, fillLanguageLabels } = await import("../src/pages/language/language.js");

const view = document.getElementById("view");
const flush = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 10)); }
};

test("primaryLanguages excludes the English fallback and drafts", () => {
  const tags = primaryLanguages(FIXTURE).map((l) => l.tag);
  assert.deepEqual(tags, ["vi-VN", "es-MX"]);
});

test("picker renders primary languages, current marked, draft/English hidden", async () => {
  view.innerHTML = languageView();
  await flush();
  const root = document.getElementById("language-root");
  const btns = [...root.querySelectorAll("[data-lang-pick]")];
  assert.deepEqual(btns.map((b) => b.dataset.langPick), ["vi-VN", "es-MX"]);
  assert.equal(root.querySelector('[data-lang-pick="en-US"]'), null, "English fallback not a picker option");
  assert.equal(root.querySelector('[data-lang-pick="zz-ZZ"]'), null, "draft language hidden");
  assert.equal(btns[0].getAttribute("aria-checked"), "true", "vi-VN is current by default");
});

test("current language is a no-op; switching persists and reloads", async () => {
  const before = reloads;
  document.querySelector('[data-lang-pick="vi-VN"]').click();
  await flush();
  assert.equal(reloads, before, "no reload for the current language");
  document.querySelector('[data-lang-pick="es-MX"]').click();
  await until(() => reloads === before + 1);
  assert.equal(localStorage.getItem("mldt.settings.language"), "es-MX", "primary language persisted");
  assert.equal(getPrimaryLang(), "es-MX", "i18n reads the chosen primary");
});

test("fillLanguageLabels shows the current primary endonym", async () => {
  await fillLanguageLabels(document);
  assert.equal(document.querySelector("[data-lang-name]").textContent, "Español");
});
