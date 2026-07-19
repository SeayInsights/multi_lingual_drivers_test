/**
 * Service worker — offline-first PWA layer.
 *
 * Precaches the app shell, data, locales, and every sign SVG the question
 * bank references (parsed from questions.json at install — the full 1,692-sign
 * gallery is intentionally NOT precached; it lazy-caches on first view).
 * Strategy: cache-first for same-origin GETs, falling back to network, with a
 * versioned cache purged on activate. Bump VERSION on every release.
 */
const VERSION = "v1.24.0";
const CACHE = `mldt-${VERSION}`;

const CORE = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.webmanifest",
  "./src/app/app.js",
  "./src/app/router.js",
  "./src/app/theme.css",
  "./src/i18n/i18n.js",
  "./src/storage/db.js",
  "./src/storage/events.js",
  "./src/storage/settings.js",
  "./src/storage/backup.js",
  "./src/pages/study/study.js",
  "./src/pages/test/test.js",
  "./src/pages/flashcards/flashcards.js",
  "./src/pages/review/review.js",
  "./src/audio/tts.js",
  "./src/pages/signs/signs.js",
  "./src/pages/progress/progress.js",
  "./src/pages/progress/aggregate.js",
  "./src/pages/history/history.js",
  "./data/signs/manifest.json",
  "./src/srs/leitner.js",
  "./src/srs/badge.js",
  "./assets/fonts/fonts.css",
  "./assets/fonts/BeVietnamPro-400-vietnamese.woff2",
  "./assets/fonts/BeVietnamPro-400-latin.woff2",
  "./assets/fonts/BeVietnamPro-600-vietnamese.woff2",
  "./assets/fonts/BeVietnamPro-600-latin.woff2",
  "./assets/fonts/BeVietnamPro-700-vietnamese.woff2",
  "./assets/fonts/BeVietnamPro-700-latin.woff2",
  "./assets/fonts/BeVietnamPro-800-vietnamese.woff2",
  "./assets/fonts/BeVietnamPro-800-latin.woff2",
  "./assets/fonts/Overpass-700-vietnamese.woff2",
  "./assets/fonts/Overpass-700-latin.woff2",
  "./assets/fonts/Overpass-900-vietnamese.woff2",
  "./assets/fonts/Overpass-900-latin.woff2",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./locales/index.json",
  "./locales/vi-VN.json",
  "./locales/vi-VN-x-north.json",
  "./locales/zh-CN.json",
  "./locales/zh-TW.json",
  "./locales/ko-KR.json",
  "./locales/ja-JP.json",
  "./locales/es-MX.json",
  "./locales/ar.json",
  "./locales/en-US.json",
  "./data/states/index.json",
  "./data/states/oh/state.json",
  "./data/states/oh/questions.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // precache exactly the sign images the question bank uses
    try {
      const bank = await (await cache.match("./data/states/oh/questions.json")).json();
      const signs = [...new Set(bank.questions.filter((q) => q.sign).map((q) => `./${q.sign.image}`))];
      await cache.addAll(signs);
    } catch (e) {
      // sign precache failure must not brick install; they lazy-cache on view
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("mldt-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const resp = await fetch(event.request);
      if (resp.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, resp.clone());
      }
      return resp;
    } catch (err) {
      // offline navigation fallback to the shell
      if (event.request.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
