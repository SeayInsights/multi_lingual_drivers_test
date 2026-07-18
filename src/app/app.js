/**
 * App boot: loads locales, wires the tab bar, registers views, starts routing.
 * Study/Signs/Test/Progress views are shell placeholders here — their real
 * implementations arrive in later work orders and replace the registrations.
 */
import { initI18n, t, bilingual, applyTranslations, getLangMode, applyLangMode, SETTINGS_KEYS } from "../i18n/i18n.js";
import { register, setNotFound, startRouter, currentPath } from "./router.js";

const TABS = [
  { path: "/home", key: "tab.home", ico: "🏠" },
  { path: "/study", key: "tab.study", ico: "📖" },
  { path: "/signs", key: "tab.signs", ico: "🛑" },
  { path: "/test", key: "tab.test", ico: "📝" },
  { path: "/progress", key: "tab.progress", ico: "📊" },
];

/* ---------- settings (shell-scope; WO-5 storage layer adopts these keys) ---------- */
const getTextSize = () => localStorage.getItem(SETTINGS_KEYS.textSize) ?? "1";
const applyTextSize = (v) => {
  localStorage.setItem(SETTINGS_KEYS.textSize, v);
  document.documentElement.dataset.textsize = v;
};
const getTheme = () => localStorage.getItem(SETTINGS_KEYS.theme) ?? "auto";
const applyTheme = (v) => {
  localStorage.setItem(SETTINGS_KEYS.theme, v);
  if (v === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
};

/* ---------- views ---------- */
function segButtons(name, options, current) {
  return `<div class="seg" role="group" data-seg="${name}">${options
    .map(
      (o) =>
        `<button type="button" data-value="${o.value}" aria-pressed="${o.value === current}">${o.label}</button>`
    )
    .join("")}</div>`;
}

function homeView() {
  return `
  <section class="card card-green">
    <h2>${bilingual("home.welcome")}</h2>
    <p>${bilingual("app.tagline")}</p>
  </section>
  <section class="card">
    <h2>${bilingual("settings.title")}</h2>
    <div class="setting-row">
      <span>${bilingual("settings.language")}</span>
      ${segButtons("langmode", [
        { value: "both", label: "Việt+EN" },
        { value: "vi", label: "Việt" },
        { value: "en", label: "EN" },
      ], getLangMode())}
    </div>
    <div class="setting-row">
      <span>${bilingual("settings.textSize")}</span>
      ${segButtons("textsize", [
        { value: "1", label: "A" },
        { value: "2", label: "A+" },
        { value: "3", label: "A++" },
      ], getTextSize())}
    </div>
    <div class="setting-row">
      <span>${bilingual("settings.darkMode")}</span>
      ${segButtons("theme", [
        { value: "auto", label: "Auto" },
        { value: "dark", label: "🌙" },
        { value: "light", label: "☀️" },
      ], getTheme())}
    </div>
  </section>`;
}

const placeholder = (titleKey) => () =>
  `<section class="card"><h2>${bilingual(titleKey)}</h2>
   <p>${bilingual("progress.keepStudying")}</p></section>`;

/* ---------- boot ---------- */
async function boot() {
  applyTextSize(getTextSize());
  applyTheme(getTheme());
  await initI18n({ primary: "vi-VN" });

  // header + static chrome
  applyTranslations(document);

  // tab bar
  const nav = document.getElementById("tabbar");
  nav.innerHTML = TABS.map(
    (tab) =>
      `<a href="#${tab.path}" data-path="${tab.path}">
         <span class="ico" aria-hidden="true">${tab.ico}</span>
         ${bilingual(tab.key)}
       </a>`
  ).join("");

  register("/home", homeView);
  register("/study", placeholder("tab.study"));
  register("/signs", placeholder("tab.signs"));
  register("/test", placeholder("tab.test"));
  register("/progress", placeholder("tab.progress"));
  setNotFound(() => `<section class="card"><h2>404</h2><p><a href="#/home">${t("action.back")}</a></p></section>`);

  const viewEl = document.getElementById("view");
  startRouter(viewEl, {
    onNavigate: (path) => {
      for (const a of nav.querySelectorAll("a")) {
        if (a.dataset.path === path) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    },
  });

  // settings interactions (event delegation on the view)
  viewEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg button");
    if (!btn) return;
    const seg = btn.closest(".seg").dataset.seg;
    const value = btn.dataset.value;
    if (seg === "textsize") applyTextSize(value);
    if (seg === "theme") applyTheme(value);
    if (seg === "langmode") {
      applyLangMode(value);
      // re-render chrome so single-language mode applies everywhere
      applyTranslations(document);
      nav.querySelectorAll("a").forEach((a) => {
        const tab = TABS.find((x) => x.path === a.dataset.path);
        a.innerHTML = `<span class="ico" aria-hidden="true">${tab.ico}</span>${bilingual(tab.key)}`;
        if (tab.path === currentPath()) a.setAttribute("aria-current", "page");
      });
    }
    for (const b of btn.parentElement.children) b.setAttribute("aria-pressed", String(b === btn));
  });
}

boot().catch((err) => {
  document.getElementById("view").innerHTML =
    `<section class="card"><h2>⚠️</h2><p>Không tải được ứng dụng · Could not load the app.<br><code>${String(err).replace(/</g, "&lt;")}</code></p></section>`;
});
