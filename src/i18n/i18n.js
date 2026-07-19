/**
 * i18n loader — loads locale JSON files, provides t() lookup, applies
 * translations to data-i18n annotated DOM, and manages the language mode
 * (both = VI primary + EN secondary, vi = VI only, en = EN only).
 *
 * Persistence note: language mode + text size are stored under the
 * 'mldt.settings.*' localStorage keys. The WO-5 storage layer adopts these
 * exact keys during its IndexedDB migration so nothing is lost.
 */
const FALLBACK = "en-US";
const locales = new Map(); // tag -> {meta, strings}
let primaryTag = "vi-VN";

export const SETTINGS_KEYS = {
  langMode: "mldt.settings.languageMode", // 'both' | 'vi' | 'en'
  textSize: "mldt.settings.textSize",     // '1' | '2' | '3'
  theme: "mldt.settings.theme",           // 'auto' | 'dark' | 'light'
  language: "mldt.settings.language",     // primary display language tag, e.g. 'vi-VN'
};

const DEFAULT_PRIMARY = "vi-VN";

/**
 * The chosen primary (non-English) display language. Read synchronously from
 * localStorage so boot can load the right locale before IndexedDB opens.
 * Adding a language never changes this file — it is just another locale tag.
 */
export function getPrimaryLang() {
  return localStorage.getItem(SETTINGS_KEYS.language) ?? DEFAULT_PRIMARY;
}

export async function loadLocale(tag) {
  if (locales.has(tag)) return locales.get(tag);
  const res = await fetch(`locales/${tag}.json`);
  if (!res.ok) throw new Error(`locale ${tag}: HTTP ${res.status}`);
  const data = await res.json();
  locales.set(tag, data);
  return data;
}

export async function initI18n({ primary, fallback = FALLBACK } = {}) {
  primaryTag = primary ?? getPrimaryLang();
  // If the chosen primary IS the fallback (English), there is no separate
  // primary to load; the app runs in English via the fallback locale.
  const toLoad = primaryTag === fallback ? [fallback] : [primaryTag, fallback];
  const results = await Promise.allSettled(toLoad.map(loadLocale));
  // A missing/broken chosen locale must never brick the app — fall back to
  // the default primary, then to English.
  if (primaryTag !== fallback && results[0].status === "rejected") {
    primaryTag = DEFAULT_PRIMARY;
    try { await loadLocale(DEFAULT_PRIMARY); } catch { primaryTag = fallback; }
  }
  applyLangMode(getLangMode());
}

/**
 * Translate key with {param} substitution. The default locale follows the
 * language mode: EN-only mode resolves en-US so every t()-rendered string
 * (counters, labels, badges) switches with the rest of the app.
 */
export function t(key, params = {}, tag = null) {
  const effective = tag ?? (getLangMode() === "en" ? FALLBACK : primaryTag);
  const data = locales.get(effective) ?? locales.get(FALLBACK);
  let s = data?.strings?.[key] ?? locales.get(FALLBACK)?.strings?.[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** English text for the secondary line. */
export const tEn = (key, params = {}) => t(key, params, FALLBACK);

/**
 * Render a bilingual label: VI primary + EN secondary (CSS hides one in
 * single-language modes). Both spans get correct lang attributes so screen
 * readers switch pronunciation.
 */
export function bilingual(key, params = {}) {
  const primary = escapeHtml(t(key, params, primaryTag));
  const en = escapeHtml(tEn(key, params));
  // .vi-main / .en-sub are historical class names for the primary and English
  // lines; the lang attribute reflects the ACTUAL primary language (vi-VN, es-MX…).
  return `<span class="vi-main" lang="${primaryTag}">${primary}</span><span class="en-sub" lang="en">${en}</span>`;
}

/** Fill every [data-i18n] element under root with bilingual content. */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.innerHTML = bilingual(el.dataset.i18n);
  }
}

export function getLangMode() {
  return localStorage.getItem(SETTINGS_KEYS.langMode) ?? "both";
}

export function applyLangMode(mode) {
  localStorage.setItem(SETTINGS_KEYS.langMode, mode);
  document.documentElement.dataset.langmode = mode;
  // In EN-only mode the page is functionally English; otherwise it reflects the
  // chosen primary language (vi, es, …) so screen readers pronounce it right.
  document.documentElement.lang = mode === "en" ? "en" : primaryTag.split("-")[0];
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
