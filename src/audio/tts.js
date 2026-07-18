/**
 * Tap-to-hear TTS — Web Speech API wrapper.
 *
 * - Picks the best available voice per language (vi-VN preferred exact match,
 *   then vi-*; same for en-US/en-*).
 * - `available(lang)` lets UIs hide speaker buttons when no voice exists
 *   (common for Vietnamese on some Androids) instead of failing silently.
 * - Respects the persisted sound setting; cancels on navigation.
 * - `synth` is injectable for tests.
 */
import { getSetting } from "../storage/settings.js";

let synthImpl = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
let UtteranceCtor = typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : null;

/** Test seam: inject a fake synthesizer + utterance constructor. */
export function _inject({ synth, Utterance }) {
  synthImpl = synth;
  UtteranceCtor = Utterance;
}

function pickVoice(lang) {
  if (!synthImpl) return null;
  const voices = synthImpl.getVoices?.() ?? [];
  const primary = lang.split("-")[0];
  return (
    voices.find((v) => v.lang?.replace("_", "-") === lang) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(primary)) ??
    null
  );
}

/** True when speech for this language can actually be produced. */
export function available(lang) {
  return Boolean(synthImpl && UtteranceCtor && pickVoice(lang));
}

/** Speak text in the given language. Resolves when finished or skipped. */
export function speak(text, lang) {
  return new Promise((resolve) => {
    if (getSetting("soundOn", true) === false) return resolve(false);
    if (!available(lang)) return resolve(false);
    synthImpl.cancel(); // one utterance at a time
    const u = new UtteranceCtor(text);
    u.lang = lang;
    u.voice = pickVoice(lang);
    u.rate = 0.95; // slightly slow for learners
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synthImpl.speak(u);
  });
}

export function stopSpeaking() {
  synthImpl?.cancel();
}

/**
 * Speaker button HTML (>=44px, aria-labeled). Consumers delegate clicks on
 * [data-speak] and call speakFromButton(btn).
 */
export function speakerButton(text, lang, ariaLabel = "Nghe / Listen") {
  if (!available(lang)) return "";
  const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<button type="button" class="speak-btn" data-speak="${escAttr(text)}" data-lang="${lang}" aria-label="${escAttr(ariaLabel)}">🔊</button>`;
}

export function speakFromButton(btn) {
  return speak(btn.dataset.speak, btn.dataset.lang);
}

/**
 * Dual-language speaker: prefers the current display language's voice; when
 * that voice is missing (common for Vietnamese on desktop PCs) it falls back
 * to the other language, speaking THAT language's text. Renders nothing only
 * when no voice exists at all.
 */
export function speakerButtonAuto({ vi, en }, ariaLabel = "Nghe / Listen") {
  const preferVi = document.documentElement.lang !== "en";
  const order = preferVi
    ? [["vi-VN", vi], ["en-US", en]]
    : [["en-US", en], ["vi-VN", vi]];
  for (const [lang, text] of order) {
    if (text && available(lang)) return speakerButton(text, lang, ariaLabel);
  }
  return "";
}

/** Wire once per page root: delegates speaker taps, cancels on hash change. */
export function wireSpeech(root) {
  if (root.dataset.speechWired) return;
  root.dataset.speechWired = "1";
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-speak]");
    if (btn) {
      e.stopPropagation();
      speakFromButton(btn);
    }
  });
  window.addEventListener("hashchange", stopSpeaking);
}
