/**
 * App boot: loads locales, wires the tab bar, registers views, starts routing.
 * Study/Signs/Test/Progress views are shell placeholders here — their real
 * implementations arrive in later work orders and replace the registrations.
 */
import { initI18n, t, bilingual, applyTranslations, getLangMode, applyLangMode, SETTINGS_KEYS } from "../i18n/i18n.js";
import { register, setNotFound, startRouter, currentPath } from "./router.js";
import { initSettings, migrateLegacyBestScore } from "../storage/settings.js";
import { studyView } from "../pages/study/study.js";
import { testView } from "../pages/test/test.js";

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

  // Storage layer: load persisted settings, then one-time import of the
  // legacy Ohio quiz best score (localStorage 'ohioBest') into the new store.
  await initSettings();
  await migrateLegacyBestScore();

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
  register("/study", studyView);
  register("/signs", placeholder("tab.signs"));
  register("/test", testView);
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

/* ---------- PWA: service worker, update toast, install prompt ---------- */
let deferredInstall = null;

function showToast(html) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.innerHTML = html;
  el.classList.add("show");
}

function wirePwa() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          showToast(`${bilingual("pwa.updateAvailable")}
            <button class="btn btn-primary" id="do-update" style="margin-top:8px">${bilingual("pwa.updateAction")}</button>`);
          document.getElementById("do-update").onclick = () => sw.postMessage("SKIP_WAITING");
        }
      });
    });
  }).catch(() => { /* PWA is progressive — app works without it */ });
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloaded) { reloaded = true; location.reload(); }
  });

  // Android/desktop install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    showToast(`${bilingual("pwa.installPrompt")}
      <button class="btn btn-primary" id="do-install" style="margin-top:8px">${bilingual("action.install")}</button>`);
    document.getElementById("do-install").onclick = async () => {
      document.getElementById("toast").classList.remove("show");
      await deferredInstall.prompt();
      deferredInstall = null;
    };
  });

  // iOS Safari has no beforeinstallprompt: show the add-to-home-screen hint once
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIos && !standalone && !localStorage.getItem("mldt.iosHintShown")) {
    localStorage.setItem("mldt.iosHintShown", "1");
    showToast(bilingual("pwa.iosInstallHint"));
    setTimeout(() => document.getElementById("toast")?.classList.remove("show"), 12000);
  }
}

boot().then(wirePwa).catch((err) => {
  document.getElementById("view").innerHTML =
    `<section class="card"><h2>⚠️</h2><p>Không tải được ứng dụng · Could not load the app.<br><code>${String(err).replace(/</g, "&lt;")}</code></p></section>`;
});
