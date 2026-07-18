#!/usr/bin/env node
/**
 * Validates all app data:
 *   1. Every data/states/<code>/state.json against state.schema.json (ajv)
 *   2. Every data/states/<code>/questions.json against questions.schema.json (ajv)
 *   3. Every locales/<tag>.json against locale.schema.json (ajv)
 *   4. Locale key parity: every locale file exposes the exact same string keys
 *   5. Cross-checks: question section ids exist in the state file; answerIndex
 *      in bounds; correct choice carries no whyWrong; sign image files exist;
 *      section questionCount sums equal totalQuestions; minCorrect <= questionCount
 *
 * Exit 0 when everything passes; exit 1 with readable errors otherwise.
 * Usage: node scripts/validate/validate-data.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => errors.push(msg);

const loadJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch (e) {
    fail(`${p}: unreadable or invalid JSON — ${e.message}`);
    return null;
  }
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const schemas = {};
for (const name of ["state", "questions", "locale"]) {
  const s = loadJson(join(ROOT, "data", "schemas", `${name}.schema.json`));
  if (s) schemas[name] = ajv.compile(s);
}

const validate = (kind, file, data) => {
  if (!schemas[kind] || data === null) return false;
  if (!schemas[kind](data)) {
    for (const e of schemas[kind].errors ?? []) {
      fail(`${file}: ${e.instancePath || "(root)"} ${e.message}`);
    }
    return false;
  }
  return true;
};

// ---- 1+2: states ----
const statesDir = join(ROOT, "data", "states");
const stateCodes = existsSync(statesDir)
  ? readdirSync(statesDir).filter((d) => statSync(join(statesDir, d)).isDirectory())
  : [];
if (stateCodes.length === 0) fail("data/states/: no state directories found");

const stateConfigs = {};
for (const code of stateCodes) {
  const stateFile = join(statesDir, code, "state.json");
  if (!existsSync(stateFile)) {
    fail(`data/states/${code}/state.json missing`);
    continue;
  }
  const data = loadJson(stateFile);
  if (validate("state", `data/states/${code}/state.json`, data)) {
    stateConfigs[code] = data;
    if (data.code !== code) {
      fail(`data/states/${code}/state.json: code '${data.code}' does not match directory '${code}'`);
    }
    const sum = data.test.sections.reduce((n, s) => n + s.questionCount, 0);
    if (sum !== data.test.totalQuestions) {
      fail(`data/states/${code}/state.json: section questionCounts sum to ${sum}, totalQuestions is ${data.test.totalQuestions}`);
    }
    for (const s of data.test.sections) {
      if (s.minCorrect > s.questionCount) {
        fail(`data/states/${code}/state.json: section '${s.id}' minCorrect ${s.minCorrect} > questionCount ${s.questionCount}`);
      }
    }
    if (data.test.passingRule === "overall" && data.test.overallMinCorrect === undefined) {
      fail(`data/states/${code}/state.json: passingRule 'overall' requires overallMinCorrect`);
    }
    ok(`data/states/${code}/state.json`);
  }

  const qFile = join(statesDir, code, "questions.json");
  if (!existsSync(qFile)) continue; // question banks may land in a later work order
  const qData = loadJson(qFile);
  if (validate("questions", `data/states/${code}/questions.json`, qData)) {
    const sectionIds = new Set((stateConfigs[code]?.test.sections ?? []).map((s) => s.id));
    const seenIds = new Set();
    qData.questions.forEach((q, i) => {
      const where = `data/states/${code}/questions.json #${i} (${q.id})`;
      if (seenIds.has(q.id)) fail(`${where}: duplicate question id`);
      seenIds.add(q.id);
      if (!q.id.startsWith(`${code}-`)) fail(`${where}: id must be prefixed '${code}-'`);
      if (sectionIds.size && !sectionIds.has(q.section)) fail(`${where}: unknown section '${q.section}'`);
      if (q.answerIndex >= q.choices.length) fail(`${where}: answerIndex ${q.answerIndex} out of bounds (${q.choices.length} choices)`);
      if (q.choices[q.answerIndex]?.whyWrong) fail(`${where}: correct choice must not carry whyWrong`);
      if (q.sign && !existsSync(join(ROOT, q.sign.image))) fail(`${where}: sign image not found: ${q.sign.image}`);
    });
    ok(`data/states/${code}/questions.json (${qData.questions.length} questions)`);
  }
}

// ---- 3+4: locales ----
const localesDir = join(ROOT, "locales");
const localeFiles = existsSync(localesDir)
  ? readdirSync(localesDir).filter((f) => f.endsWith(".json"))
  : [];
if (localeFiles.length === 0) fail("locales/: no locale files found");

const keySets = {};
for (const f of localeFiles) {
  const data = loadJson(join(localesDir, f));
  if (validate("locale", `locales/${f}`, data)) {
    if (`${data.meta.code}.json` !== f) {
      fail(`locales/${f}: meta.code '${data.meta.code}' does not match filename`);
    }
    keySets[f] = new Set(Object.keys(data.strings));
    ok(`locales/${f} (${keySets[f].size} strings)`);
  }
}
const files = Object.keys(keySets);
for (let i = 1; i < files.length; i++) {
  const [a, b] = [files[0], files[i]];
  for (const k of keySets[a]) if (!keySets[b].has(k)) fail(`locales/${b}: missing key '${k}' (present in ${a})`);
  for (const k of keySets[b]) if (!keySets[a].has(k)) fail(`locales/${a}: missing key '${k}' (present in ${b})`);
}
if (files.length > 1 && errors.length === 0) ok(`locale key parity across ${files.length} files`);

// ---- verdict ----
if (errors.length) {
  console.error(`\n✗ ${errors.length} validation error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nAll data valid.");
