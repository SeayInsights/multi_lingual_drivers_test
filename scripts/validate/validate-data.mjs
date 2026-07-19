#!/usr/bin/env node
/**
 * Validates all app data:
 *   1. data/states/index.json (states registry) against states-index.schema.json,
 *      plus registry <-> directory consistency both ways
 *   2. Every data/states/<code>/state.json against state.schema.json (ajv)
 *   3. Every data/states/<code>/questions.json against questions.schema.json (ajv)
 *   4. data/questions/national-signs.json (shared MUTCD pool) — schema, per-question
 *      checks, and a no-state-references guard
 *   5. Every locales/<tag>.json against locale.schema.json (ajv)
 *   6. Locale key parity: every locale file exposes the exact same string keys
 *   7. Cross-checks: question section ids exist in the state file; answerIndex
 *      in bounds; correct choice carries no whyWrong; sign image files exist;
 *      section questionCount sums equal totalQuestions; minCorrect <= questionCount;
 *      bank sufficiency — every 'available' state's bank has at least
 *      section.questionCount questions per section (the test simulation draws
 *      that many without replacement)
 *
 * 'draft' states (registry status) are schema-checked but exempt from bank
 * presence/sufficiency — they are hidden from users until flipped to 'available'.
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
for (const name of ["state", "questions", "locale", "states-index"]) {
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

// Per-question checks shared by state banks and the national pool.
const checkQuestions = (fileLabel, qData, { idPrefix, sectionIds }) => {
  const seenIds = new Set();
  qData.questions.forEach((q, i) => {
    const where = `${fileLabel} #${i} (${q.id})`;
    if (seenIds.has(q.id)) fail(`${where}: duplicate question id`);
    seenIds.add(q.id);
    if (!q.id.startsWith(idPrefix)) fail(`${where}: id must be prefixed '${idPrefix}'`);
    if (sectionIds?.size && !sectionIds.has(q.section)) fail(`${where}: unknown section '${q.section}'`);
    if (q.answerIndex >= q.choices.length) fail(`${where}: answerIndex ${q.answerIndex} out of bounds (${q.choices.length} choices)`);
    if (q.choices[q.answerIndex]?.whyWrong) fail(`${where}: correct choice must not carry whyWrong`);
    if (q.sign && !existsSync(join(ROOT, q.sign.image))) fail(`${where}: sign image not found: ${q.sign.image}`);
  });
};

// ---- 1: states registry ----
const statesDir = join(ROOT, "data", "states");
const stateDirs = existsSync(statesDir)
  ? readdirSync(statesDir).filter((d) => statSync(join(statesDir, d)).isDirectory())
  : [];
if (stateDirs.length === 0) fail("data/states/: no state directories found");

const registryFile = join(statesDir, "index.json");
const registry = existsSync(registryFile) ? loadJson(registryFile) : null;
const registryStatus = {}; // code -> available | draft
if (registry === null && existsSync(registryFile)) {
  // loadJson already recorded the parse failure
} else if (!existsSync(registryFile)) {
  fail("data/states/index.json missing — every state directory must be registered");
} else if (validate("states-index", "data/states/index.json", registry)) {
  const seenCodes = new Set();
  for (const entry of registry.states) {
    if (seenCodes.has(entry.code)) fail(`data/states/index.json: duplicate state code '${entry.code}'`);
    seenCodes.add(entry.code);
    registryStatus[entry.code] = entry.status;
    if (!stateDirs.includes(entry.code)) {
      fail(`data/states/index.json: '${entry.code}' registered but data/states/${entry.code}/ does not exist`);
    }
  }
  for (const code of stateDirs) {
    if (!seenCodes.has(code)) {
      fail(`data/states/${code}/ exists but is not registered in data/states/index.json`);
    }
  }
  ok(`data/states/index.json (${registry.states.length} states)`);
}

// ---- 2+3: states ----
const stateConfigs = {};
for (const code of stateDirs) {
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

  const isDraft = registryStatus[code] === "draft";
  const qFile = join(statesDir, code, "questions.json");
  if (!existsSync(qFile)) {
    if (!isDraft) fail(`data/states/${code}/questions.json missing — 'available' states must ship a bank (run scripts/build-questions.mjs ${code})`);
    continue;
  }
  const qData = loadJson(qFile);
  if (validate("questions", `data/states/${code}/questions.json`, qData)) {
    const sections = stateConfigs[code]?.test.sections ?? [];
    const sectionIds = new Set(sections.map((s) => s.id));
    checkQuestions(`data/states/${code}/questions.json`, qData, { idPrefix: `${code}-`, sectionIds });

    // bank sufficiency: the test simulation draws questionCount per section
    // without replacement — the bank must cover every section fully
    if (!isDraft) {
      const bySection = {};
      for (const q of qData.questions) bySection[q.section] = (bySection[q.section] ?? 0) + 1;
      for (const s of sections) {
        const have = bySection[s.id] ?? 0;
        if (have < s.questionCount) {
          fail(`data/states/${code}/questions.json: section '${s.id}' has ${have} questions but the test draws ${s.questionCount} — bank insufficient`);
        }
      }
    }
    ok(`data/states/${code}/questions.json (${qData.questions.length} questions${isDraft ? ", draft" : ""})`);
  }
}

// ---- 4: national pools (shared, stamped per state) ----
const checkPool = (file, declared) => {
  const poolFile = join(ROOT, "data", "questions", file);
  if (existsSync(poolFile)) {
    const pool = loadJson(poolFile);
    if (validate("questions", `data/questions/${file}`, pool)) {
      checkQuestions(`data/questions/${file}`, pool, { idPrefix: "us-" });
      // No Ohio-specific content may leak into a national pool.
      const leaks = pool.questions.filter((q) => /\bohio\b|\bbmv\b|tipic|digest/i.test(JSON.stringify(q)));
      for (const q of leaks) fail(`data/questions/${file} (${q.id}): Ohio-specific reference in national pool`);
      ok(`data/questions/${file} (${pool.questions.length} questions)`);
    }
  } else if (Object.values(stateConfigs).some((s) => s.content?.[declared] === true)) {
    fail(`data/questions/${file} missing but a state declares content.${declared}`);
  }
};
checkPool("national-signs.json", "nationalSigns");
checkPool("national-rules.json", "nationalRules");

// ---- 5+6: locales ----
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

// ---- 7: service worker version guard (stale-release protection) ----
import { spawnSync } from "node:child_process";
const swCheck = spawnSync(process.execPath, [join(ROOT, "scripts", "validate", "check-sw-version.mjs")], { encoding: "utf-8" });
if (swCheck.status === 0) {
  ok(swCheck.stdout.trim());
} else {
  fail(`sw-version: ${(swCheck.stderr || swCheck.stdout).trim()}`);
}

// ---- verdict ----
if (errors.length) {
  console.error(`\n✗ ${errors.length} validation error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nAll data valid.");
