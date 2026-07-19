/**
 * Language picker — #/language. Lets the user choose their primary display
 * language (the main line; English is always the secondary line via the
 * language-mode toggle). Reads the locales registry (locales/index.json);
 * adding a language is one locale file + one registry entry — no app code.
 * Picking a language persists the setting and reloads (offline-safe: locales
 * are runtime-cached by the service worker after first fetch).
 */
import { t, bilingual, getPrimaryLang, SETTINGS_KEYS } from "../../i18n/i18n.js";
import { setSetting } from "../../storage/settings.js";

let registry = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadRegistry() {
  if (registry) return registry;
  const res = await fetch("locales/index.json");
  if (!res.ok) throw new Error(`locales registry: HTTP ${res.status}`);
  registry = await res.json();
  return registry;
}

/** Primary-language options: available languages other than the English fallback. */
export function primaryLanguages(reg) {
  const fallback = reg.fallback ?? "en-US";
  return reg.languages.filter((l) => l.status === "available" && l.tag !== fallback);
}

function listHtml() {
  const current = getPrimaryLang();
  const rows = primaryLanguages(registry)
    .map((l) => {
      const isCurrent = l.tag === current;
      return `
      <button type="button" role="radio" aria-checked="${isCurrent}" data-lang-pick="${esc(l.tag)}"
        class="btn ${isCurrent ? "btn-primary" : "btn-secondary"}"
        style="margin-bottom:10px;justify-content:space-between;min-height:56px">
        <span><span lang="${esc(l.tag)}">${esc(l.endonym)}</span> · ${esc(l.englishName)}</span>
        <span style="font-size:.85em">${isCurrent ? `✓ ${bilingual("language.current")}` : ""}</span>
      </button>`;
    })
    .join("");
  return `
  <section class="card">
    <h2>${bilingual("language.title")}</h2>
    <p>${bilingual("language.subtitle")}</p>
    <div role="radiogroup" aria-label="${esc(t("language.title"))}">${rows}</div>
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
  root.innerHTML = listHtml();
  if (root.dataset.wired) return;
  root.dataset.wired = "1";
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-lang-pick]");
    if (!btn) return;
    const tag = btn.dataset.langPick;
    if (tag === getPrimaryLang()) return;
    await setSetting("language", tag);
    localStorage.setItem(SETTINGS_KEYS.language, tag); // ensure boot reads it before IDB
    location.reload();
  });
}

export function languageView() {
  queueMicrotask(bootLanguage);
  return `<div id="language-root"><section class="card"><p>…</p></section></div>`;
}

/** Fill [data-lang-name] elements with the current primary language endonym. */
export async function fillLanguageLabels(rootEl = document) {
  try {
    await loadRegistry();
  } catch {
    return;
  }
  const current = getPrimaryLang();
  const entry = registry.languages.find((l) => l.tag === current);
  if (!entry) return;
  for (const el of rootEl.querySelectorAll("[data-lang-name]")) el.textContent = entry.endonym;
}
