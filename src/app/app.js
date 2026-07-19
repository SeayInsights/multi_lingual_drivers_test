/**
 * App boot: loads locales, wires the tab bar, registers views, starts routing.
 * Study/Signs/Test/Progress views are shell placeholders here — their real
 * implementations arrive in later work orders and replace the registrations.
 */
import { initI18n, t, bilingual, applyTranslations, getLangMode, applyLangMode, SETTINGS_KEYS } from "../i18n/i18n.js";
import { register, setNotFound, startRouter, currentPath, rerender } from "./router.js";
import { initSettings, migrateLegacyBestScore, getSetting, setSetting } from "../storage/settings.js";
import { studyView } from "../pages/study/study.js";
import { testView } from "../pages/test/test.js";
import { flashcardsView } from "../pages/flashcards/flashcards.js";
import { fillDueBadges } from "../srs/badge.js";
import { reviewView, fillReviewBadges } from "../pages/review/review.js";
import { signsView } from "../pages/signs/signs.js";
import { progressView } from "../pages/progress/progress.js";
import { stateView, fillStateLabels } from "../pages/state/state.js";
import { languageView, fillLanguageLabels } from "../pages/language/language.js";
import { historyView } from "../pages/history/history.js";

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
  queueMicrotask(fillDueBadges);
  queueMicrotask(fillReviewBadges);
  queueMicrotask(fillStateLabels);
  queueMicrotask(fillLanguageLabels);
  return `
  <section class="card card-green">
    <h2>${bilingual("home.welcome")}</h2>
    <p>${bilingual("app.tagline")}</p>
  </section>
  <a class="btn btn-secondary" href="#/flashcards" style="margin-bottom:10px;text-decoration:none;justify-content:space-between">
    <span>🃏 ${bilingual("flash.entry")}</span>
    <span class="flash-due-badge" style="font-weight:600;font-size:.85em;color:var(--muted)"></span>
  </a>
  <a class="btn btn-secondary" href="#/review" style="margin-bottom:10px;text-decoration:none;justify-content:space-between">
    <span>🔁 ${bilingual("review.entry")}</span>
    <span class="review-missed-badge" style="font-weight:600;font-size:.85em;color:var(--orange)"></span>
  </a>
  <a class="btn btn-secondary" href="#/history" style="margin-bottom:14px;text-decoration:none">
    <span>📈 ${bilingual("history.entry")}</span>
  </a>
  <section class="card">
    <h2>${bilingual("settings.title")}</h2>
    <div class="setting-row">
      <span>${bilingual("settings.state")}</span>
      <a class="btn btn-secondary" href="#/state"
        style="width:auto;min-height:44px;padding:8px 14px;text-decoration:none;display:inline-flex;gap:8px">
        <span data-state-name>Ohio</span><span aria-hidden="true">›</span>
      </a>
    </div>
    <div class="setting-row">
      <span>${bilingual("language.setting")}</span>
      <a class="btn btn-secondary" href="#/language"
        style="width:auto;min-height:44px;padding:8px 14px;text-decoration:none;display:inline-flex;gap:8px">
        <span data-lang-name>Tiếng Việt</span><span aria-hidden="true">›</span>
      </a>
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
    <div class="setting-row">
      <span>${bilingual("settings.sound")}</span>
      ${segButtons("sound", [
        { value: "on", label: "🔊" },
        { value: "off", label: "🔇" },
      ], getSetting("soundOn", true) === false ? "off" : "on")}
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
  await initI18n(); // primary language comes from the 'language' setting (default vi-VN)

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
  register("/state", stateView);
  register("/language", languageView);
  register("/study", studyView);
  register("/signs", signsView);
  register("/test", testView);
  register("/flashcards", flashcardsView);
  register("/review", reviewView);
  register("/history", historyView);
  register("/progress", progressView);
  setNotFound(() => `<section class="card"><h2>404</h2><p><a href="#/home">${t("action.back")}</a></p></section>`);

  // header route chip shows the chosen state (decorative — fills when ready)
  fillStateLabels(document);

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
    if (seg === "sound") setSetting("soundOn", value === "on");
    if (seg === "langmode") {
      applyLangMode(value);
      // re-render chrome AND the active view so every t()-rendered string switches
      applyTranslations(document);
      nav.querySelectorAll("a").forEach((a) => {
        const tab = TABS.find((x) => x.path === a.dataset.path);
        a.innerHTML = `<span class="ico" aria-hidden="true">${tab.ico}</span>${bilingual(tab.key)}`;
        if (tab.path === currentPath()) a.setAttribute("aria-current", "page");
      });
      rerender();
      return; // rerender rebuilt the segs with correct aria-pressed
    }
    for (const b of btn.parentElement.children) b.setAttribute("aria-pressed", String(b === btn));
  });
}

/* ---------- PWA: service worker, update toast, install prompt ---------- */
let deferredInstall = null;

function showToast(html, { dismissKey } = {}) {
  // dismissKey: remember dismissal in localStorage and never re-show
  if (dismissKey && localStorage.getItem(dismissKey)) return;
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="flex:1">${html}</div>
      <button id="toast-close" aria-label="Đóng / Close"
        style="flex:none;width:44px;height:44px;border:2px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font-size:1.1rem;font-weight:800">✕</button>
    </div>`;
  el.classList.add("show");
  el.querySelector("#toast-close").onclick = () => {
    el.classList.remove("show");
    if (dismissKey) localStorage.setItem(dismissKey, "1");
  };
}

function wirePwa() {
  if (!("serviceWorker" in navigator)) return;
  // Register after load + idle so the 50-asset precache never competes with
  // first paint (Lighthouse TBT finding).
  const idle = (fn) => {
    if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 1500);
  };
  const start = () => registerSw();
  if (document.readyState === "complete") idle(start);
  else window.addEventListener("load", () => idle(start), { once: true });
}

function registerSw() {
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
  // Reload on controllerchange ONLY when an update replaced an existing
  // controller. On first install, clients.claim() also fires this event —
  // reloading there gave every first-time visitor a phantom page reload
  // (found via the M2 CWV audit: Lighthouse modeled it as a 1.5s redirect).
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    if (!reloaded) { reloaded = true; location.reload(); }
  });

  // Android/desktop install prompt (dismissable, dismissal remembered)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (localStorage.getItem("mldt.installDismissed")) return;
    deferredInstall = e;
    showToast(`${bilingual("pwa.installPrompt")}
      <button class="btn btn-primary" id="do-install" style="margin-top:8px">${bilingual("action.install")}</button>`,
      { dismissKey: "mldt.installDismissed" });
    document.getElementById("do-install")?.addEventListener("click", async () => {
      document.getElementById("toast").classList.remove("show");
      await deferredInstall.prompt();
      deferredInstall = null;
    });
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
