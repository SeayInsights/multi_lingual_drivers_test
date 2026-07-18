/**
 * TTS wrapper tests (WO C) — injected fake synthesizer.
 * Run: node --test tests/audio.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!DOCTYPE html><html lang="vi"><body></body></html>`, { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};
await import("fake-indexeddb/auto");
globalThis.indexedDB ??= dom.window.indexedDB;
globalThis.IDBKeyRange ??= dom.window.IDBKeyRange;

const tts = await import("../src/audio/tts.js");
const settings = await import("../src/storage/settings.js");
await settings.initSettings();

function fakeSynth(voices) {
  const spoken = [];
  return {
    spoken,
    synth: {
      getVoices: () => voices,
      cancel: () => spoken.push("<cancel>"),
      speak: (u) => { spoken.push(u); queueMicrotask(() => u.onend?.()); },
    },
  };
}
class FakeUtterance {
  constructor(text) { this.text = text; }
}

test("voice selection: exact tag, then primary-language fallback, else unavailable", () => {
  const { synth } = fakeSynth([{ lang: "vi-VN" }, { lang: "en-US" }]);
  tts._inject({ synth, Utterance: FakeUtterance });
  assert.equal(tts.available("vi-VN"), true);
  assert.equal(tts.available("en-US"), true);

  tts._inject({ synth: fakeSynth([{ lang: "vi_VN" }]).synth, Utterance: FakeUtterance });
  assert.equal(tts.available("vi-VN"), true, "underscore locale normalized");

  tts._inject({ synth: fakeSynth([{ lang: "en-GB" }]).synth, Utterance: FakeUtterance });
  assert.equal(tts.available("en-US"), true, "primary-language fallback");
  assert.equal(tts.available("vi-VN"), false, "no vietnamese voice -> unavailable");
});

test("speak resolves true and cancels previous utterance first", async () => {
  const { synth, spoken } = fakeSynth([{ lang: "vi-VN" }]);
  tts._inject({ synth, Utterance: FakeUtterance });
  const ok = await tts.speak("Xin chào", "vi-VN");
  assert.equal(ok, true);
  assert.equal(spoken[0], "<cancel>", "cancel before speak");
  assert.equal(spoken[1].text, "Xin chào");
  assert.equal(spoken[1].lang, "vi-VN");
  assert.ok(spoken[1].rate < 1, "learner-paced rate");
});

test("sound setting off silences speech", async () => {
  const { synth, spoken } = fakeSynth([{ lang: "vi-VN" }]);
  tts._inject({ synth, Utterance: FakeUtterance });
  await settings.setSetting("soundOn", false);
  const ok = await tts.speak("Im lặng", "vi-VN");
  assert.equal(ok, false);
  assert.equal(spoken.length, 0, "nothing spoken");
  await settings.setSetting("soundOn", true);
});

test("speakerButton renders only when a voice exists; escapes text", () => {
  tts._inject({ synth: fakeSynth([{ lang: "vi-VN" }]).synth, Utterance: FakeUtterance });
  const html = tts.speakerButton('Dừng "lại" <hẳn>', "vi-VN");
  assert.match(html, /data-speak="Dừng &quot;lại&quot; &lt;hẳn>"/);
  assert.match(html, /aria-label/);
  tts._inject({ synth: fakeSynth([]).synth, Utterance: FakeUtterance });
  assert.equal(tts.speakerButton("x", "vi-VN"), "", "no voice -> no button");
});

test("no synthesizer at all: available false, speak resolves false, no crash", async () => {
  tts._inject({ synth: null, Utterance: null });
  assert.equal(tts.available("vi-VN"), false);
  assert.equal(await tts.speak("x", "vi-VN"), false);
  tts.stopSpeaking(); // must not throw
});
