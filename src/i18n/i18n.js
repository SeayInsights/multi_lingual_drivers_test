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
};

export async function loadLocale(tag) {
  if (locales.has(tag)) return locales.get(tag);
  const res = await fetch(`locales/${tag}.json`);
  if (!res.ok) throw new Error(`locale ${tag}: HTTP ${res.status}`);
  const data = await res.json();
  locales.set(tag, data);
  return data;
}

export async function initI18n({ primary = "vi-VN", fallback = FALLBACK } = {}) {
  primaryTag = primary;
  await Promise.all([loadLocale(primary), loadLocale(fallback)]);
  applyLangMode(getLangMode());
}

/** Translate key in the given locale (defaults to primary), with {param} substitution. */
export function t(key, params = {}, tag = primaryTag) {
  const data = locales.get(tag) ?? locales.get(FALLBACK);
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
  const vi = escapeHtml(t(key, params));
  const en = escapeHtml(tEn(key, params));
  return `<span class="vi-main" lang="vi">${vi}</span><span class="en-sub" lang="en">${en}</span>`;
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
  // In EN-only mode the page is functionally English.
  document.documentElement.lang = mode === "en" ? "en" : "vi";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
