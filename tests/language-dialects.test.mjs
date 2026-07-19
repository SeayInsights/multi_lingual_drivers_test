/**
 * Dialect grouping + RTL tests (M8 WO a92ed23d): the language picker groups
 * dialects under a base language with a sub-selection, and the app applies
 * dir=rtl when the primary language is right-to-left.
 * Run: node --test tests/language-dialects.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dom = new JSDOM(`<!DOCTYPE html><html lang="vi"><body><main id="view"></main></body></html>`, { url: "http://localhost/" });
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

// Fixture with a two-dialect Vietnamese group + an RTL Arabic language.
const FIXTURE = {
  version: 3, fallback: "en-US",
  languages: [
    { tag: "vi-VN", endonym: "Tiếng Việt", englishName: "Vietnamese", base: "vi", variantLabel: "Miền Nam", status: "available" },
    { tag: "vi-VN-x-north", endonym: "Tiếng Việt", englishName: "Vietnamese", base: "vi", variantLabel: "Miền Bắc", status: "available" },
    { tag: "es-MX", endonym: "Español", englishName: "Spanish", status: "available" },
    { tag: "ar", endonym: "العربية", englishName: "Arabic", direction: "rtl", status: "available" },
    { tag: "en-US", endonym: "English", englishName: "English", status: "available" },
  ],
};
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "");
  if (rel === "locales/index.json") return { ok: true, status: 200, json: async () => structuredClone(FIXTURE) };
  try {
    const body = await readFile(join(ROOT, rel), "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch { return { ok: false, status: 404, json: async () => { throw new Error("404"); } }; }
};
await import("fake-indexeddb/auto");
globalThis.indexedDB ??= dom.window.indexedDB;
globalThis.IDBKeyRange ??= dom.window.IDBKeyRange;

const { initI18n, applyLangMode, primaryDirection } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const { initSettings } = await import("../src/storage/settings.js");
await initSettings();
const { languageView, languageGroups } = await import("../src/pages/language/language.js");

const view = document.getElementById("view");
const flush = () => new Promise((r) => setTimeout(r, 0));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
// The pick handler awaits two IndexedDB writes before location.reload(); poll
// until a condition holds (or time out) instead of assuming a fixed tick count.
const until = async (cond, tries = 50) => {
  for (let i = 0; i < tries; i++) { if (cond()) return true; await flush(); }
  return cond();
};

test("languageGroups groups dialects under a base, groups A-Z", () => {
  const groups = languageGroups(FIXTURE);
  const bases = groups.map((g) => g.base);
  assert.deepEqual(bases, ["ar", "en-US", "es-MX", "vi"], "one group per base, A-Z by English name");
  const vi = groups.find((g) => g.base === "vi");
  assert.deepEqual(vi.variants.map((v) => v.tag), ["vi-VN", "vi-VN-x-north"], "both Vietnamese dialects grouped");
});

test("multi-dialect group shows a base row; expanding reveals dialect sub-rows", async () => {
  view.innerHTML = languageView();
  await flush();
  const root = document.getElementById("language-root");
  // Vietnamese is the current primary (vi-VN) → its group auto-expands, showing dialect rows
  assert.ok(root.querySelector('[data-lang-pick="vi-VN"]'), "Miền Nam dialect row shown");
  assert.ok(root.querySelector('[data-lang-pick="vi-VN-x-north"]'), "Miền Bắc dialect row shown");
  // Arabic is a standalone group → a plain row (no dialect toggle)
  assert.ok(root.querySelector('[data-lang-pick="ar"]'), "Arabic is a direct row");
  // A base toggle exists for Vietnamese
  assert.ok(root.querySelector('[data-lang-group="vi"]'), "Vietnamese base group toggle present");
});

test("picking the Northern dialect persists that exact tag", async () => {
  const before = reloads;
  click(document.querySelector('[data-lang-pick="vi-VN-x-north"]'));
  await until(() => reloads > before);
  assert.equal(localStorage.getItem("mldt.settings.language"), "vi-VN-x-north", "Northern dialect persisted");
  assert.equal(reloads, before + 1);
});

test("choosing an RTL language sets document dir = rtl", async () => {
  await initI18n({ primary: "ar" });   // loads ar.json (meta.direction rtl)
  applyLangMode("both");
  assert.equal(primaryDirection(), "rtl", "Arabic reports rtl");
  assert.equal(document.documentElement.dir, "rtl", "document direction is rtl");
  // English-only mode is always ltr
  applyLangMode("en");
  assert.equal(document.documentElement.dir, "ltr", "English-only mode is ltr");
});
