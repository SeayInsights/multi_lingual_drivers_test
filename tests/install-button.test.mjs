/**
 * In-app install affordance (M9): a persistent "Install app" button lives in the
 * home Settings, appears only after the user has closed the install popup, and
 * still works because the beforeinstallprompt event is retained past dismissal.
 * These are source-guard checks (app.js boots the whole PWA, so it isn't mounted
 * in jsdom — the same approach the existing app.js tests use).
 * Run: node --test tests/install-button.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/app/app.js", import.meta.url), "utf-8");

test("the offer is gated on a prior dismissal AND not-already-installed", () => {
  assert.match(src, /INSTALL_DISMISS_KEYS\s*=\s*\[[^\]]*mldt\.installDismissed[^\]]*mldt\.iosHintShown[^\]]*\]/s,
    "both dismissal keys count as 'user closed the popup'");
  assert.match(src, /function installOfferAvailable\(\)\s*\{[\s\S]*INSTALL_DISMISS_KEYS\.some[\s\S]*!isStandalone\(\)[\s\S]*\}/,
    "installOfferAvailable requires a dismiss key and non-standalone");
});

test("the home Settings renders the install row only when the offer is available", () => {
  assert.match(src, /installOfferAvailable\(\)\s*\?\s*`[\s\S]*data-action="install-app"[\s\S]*`\s*:\s*""/,
    "install row is conditional on installOfferAvailable()");
  assert.match(src, /id="install-setting"/, "install row has a stable id for removal");
});

test("beforeinstallprompt retains the event BEFORE honoring the dismissal", () => {
  const handler = src.match(/beforeinstallprompt"[\s\S]*?\n\s{2}\}\);/);
  assert.ok(handler, "found the beforeinstallprompt handler");
  const body = handler[0];
  const retain = body.indexOf("deferredInstall = e");
  const dismissedReturn = body.indexOf('localStorage.getItem("mldt.installDismissed")) return');
  assert.ok(retain !== -1 && dismissedReturn !== -1, "both retention and dismissal guard present");
  assert.ok(retain < dismissedReturn,
    "the event is captured before the dismissal early-return, so the Settings button can install later");
});

test("clicking the button prompts natively or reveals iOS instructions inline (no popup)", () => {
  assert.match(src, /data-action="install-app"[\s\S]*?triggerInstall\(\)/,
    "the settings button is wired to triggerInstall via delegation");
  assert.match(src, /async function triggerInstall\(\)\s*\{[\s\S]*deferredInstall\.prompt\(\)[\s\S]*install-ios-help[\s\S]*\}/,
    "triggerInstall uses the native prompt, else reveals the inline iOS hint");
});

test("install cleans up the offer, and reuses existing i18n keys (parity untouched)", () => {
  assert.match(src, /"appinstalled"[\s\S]*install-setting"\)\?\.remove\(\)/, "appinstalled removes the row");
  // No new locale key was introduced — the row reuses keys that exist in all locales.
  assert.match(src, /bilingual\("pwa\.installPrompt"\)/);
  assert.match(src, /bilingual\("action\.install"\)/);
  assert.match(src, /bilingual\("pwa\.iosInstallHint"\)/);
});
