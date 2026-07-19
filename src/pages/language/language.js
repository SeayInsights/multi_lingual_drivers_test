/**
 * Language picker — #/language. Lets the user choose their primary display
 * language (the main line; English is always the secondary line via the
 * language-mode toggle). Reads the locales registry (locales/index.json);
 * adding a language is one locale file + one registry entry — no app code.
 * Picking a language persists the setting and reloads (offline-safe: locales
 * are runtime-cached by the service worker after first fetch).
 */
import { t, bilingual, getPrimaryLang, getLangMode, applyLangMode, SETTINGS_KEYS } from "../../i18n/i18n.js";
import { setSetting } from "../../storage/settings.js";

let registry = null;
let query = ""; // search filter

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normalize = (s) => String(s).toLowerCase().replaceAll("đ", "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

async function loadRegistry() {
  if (registry) return registry;
  const res = await fetch("locales/index.json");
  if (!res.ok) throw new Error(`locales registry: HTTP ${res.status}`);
  registry = await res.json();
  return registry;
}

const fallbackTag = () => registry.fallback ?? "en-US";

/**
 * The tag currently selected in the picker. Choosing the English fallback puts
 * the app in English-only mode (like the real test); any other language shows
 * that language on top with English underneath. So "current" is English when
 * the display mode is English-only, otherwise the chosen primary language.
 */
function currentTag() {
  return getLangMode() === "en" ? fallbackTag() : getPrimaryLang();
}

/** All available languages, sorted A–Z by English name. English is included —
 * picking it is the English-only rehearsal mode. */
export function pickerLanguages(reg) {
  return reg.languages
    .filter((l) => l.status === "available")
    .sort((a, b) => a.englishName.localeCompare(b.englishName));
}

function filteredLanguages() {
  const q = normalize(query.trim());
  const all = pickerLanguages(registry);
  if (!q) return all;
  return all.filter((l) => normalize(`${l.endonym} ${l.englishName} ${l.tag}`).includes(q));
}

function rowsHtml() {
  const current = currentTag();
  const list = filteredLanguages();
  if (list.length === 0) return `<p style="color:var(--muted)">${bilingual("picker.noResults")}</p>`;
  return list
    .map((l) => {
      const isCurrent = l.tag === current;
      const label = l.tag === fallbackTag()
        ? esc(l.endonym) // English shows once (it is the sole line in English-only mode)
        : `<span lang="${esc(l.tag)}">${esc(l.endonym)}</span> · ${esc(l.englishName)}`;
      return `
      <button type="button" role="radio" aria-checked="${isCurrent}" data-lang-pick="${esc(l.tag)}"
        class="btn ${isCurrent ? "btn-primary" : "btn-secondary"}"
        style="margin-bottom:10px;justify-content:space-between;min-height:56px">
        <span>${label}</span>
        <span style="font-size:.85em">${isCurrent ? `✓ ${bilingual("language.current")}` : ""}</span>
      </button>`;
    })
    .join("");
}

function listHtml() {
  return `
  <section class="card">
    <a class="btn btn-secondary" href="#/home"
      style="width:auto;min-height:44px;padding:8px 16px;text-decoration:none;margin-bottom:12px;display:inline-flex">
      ← ${esc(t("picker.done"))}</a>
    <h2>${bilingual("language.title")}</h2>
    <p>${bilingual("language.subtitle")}</p>
    <input id="language-search" type="search" value="${esc(query)}"
      placeholder="${esc(t("picker.search"))}" aria-label="${esc(t("picker.search"))}"
      style="width:100%;min-height:48px;padding:10px 14px;border:2.5px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-family:inherit;font-size:1rem;margin-bottom:12px">
    <div id="language-rows" role="radiogroup" aria-label="${esc(t("language.title"))}">${rowsHtml()}</div>
    <p style="color:var(--muted)">${bilingual("language.comingSoon")}</p>
  </section>`;
}

async function bootLanguage() {
  const root = document.getElementById("language-root");
  if (!root) return;
  try {
    await loadRegistry();
  } catch (err) {
    root.innerHTML = `<section class="card"><h2>⚠️</h2><p>${esc(String(err))}</p></section>`;
    return;
  }
  query = "";
  root.innerHTML = listHtml();
  if (root.dataset.wired) return;
  root.dataset.wired = "1";
  root.addEventListener("input", (e) => {
    if (e.target.id !== "language-search") return;
    query = e.target.value;
    const rows = document.getElementById("language-rows");
    if (rows) rows.innerHTML = rowsHtml();
  });
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-lang-pick]");
    if (!btn) return;
    const tag = btn.dataset.langPick;
    if (tag === currentTag()) return; // already selected
    if (tag === fallbackTag()) {
      // English-only mode (rehearse like the real test); primary is left intact
      applyLangMode("en");
      await setSetting("languageMode", "en");
    } else {
      await setSetting("language", tag);
      localStorage.setItem(SETTINGS_KEYS.language, tag); // boot reads it before IDB
      applyLangMode("both");
      await setSetting("languageMode", "both");
    }
    location.reload();
  });
}

export function languageView() {
  queueMicrotask(bootLanguage);
  return `<div id="language-root"><section class="card"><p>…</p></section></div>`;
}

/** Fill [data-lang-name] elements with the current language endonym (English
 * when in English-only mode, otherwise the chosen primary language). */
export async function fillLanguageLabels(rootEl = document) {
  try {
    await loadRegistry();
  } catch {
    return;
  }
  const entry = registry.languages.find((l) => l.tag === currentTag());
  if (!entry) return;
  for (const el of rootEl.querySelectorAll("[data-lang-name]")) el.textContent = entry.endonym;
}
