#!/usr/bin/env node
/**
 * One-time migration: legacy/Luyen-Thi-Bang-Lai-Xe-Ohio.html `Q` array
 *   -> data/states/oh/questions.json (questions.schema.json shape)
 *
 * Legacy record: {cat, sign?, qv, qe, c: [[vi,en],...], a, ev, ee}
 *   - correct answer is always authored at index `a` (0 in the legacy bank)
 *   - cat 'signs' -> section 'signs'; all other cats -> section 'rules'
 *     (category keeps the finer legacy grouping)
 *   - legacy has no per-choice whyWrong (optional in the schema) and no
 *     difficulty (defaulted to 2 = typical test question)
 *
 * Sign keys map to MUTCD codes; each candidate list is resolved against the
 * files actually on disk in traffic_signs/ — missing files fail the run.
 *
 * Usage: node scripts/migrate/extract-legacy.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEGACY = join(ROOT, "legacy", "Luyen-Thi-Bang-Lai-Xe-Ohio.html");
const OUT = join(ROOT, "data", "states", "oh", "questions.json");

// legacy sign key -> MUTCD code candidates (first existing file wins)
const SIGN_CODES = {
  stop: ["R1-1"], yield: ["R1-2"], dne: ["R5-1"], wrongway: ["R5-1a"],
  oneway: ["R6-1R", "R6-2R", "R6-1"], nouturn: ["R3-4"], noleft: ["R3-2"],
  speed: ["R2-1"], school: ["S1-1"], rxr: ["W10-1"], signal: ["W3-3"],
  merge: ["W4-1R", "W4-1"], twoway: ["W6-3"], slippery: ["W8-5"],
  ped: ["W11-2"], stopahead: ["W3-1", "W3-1a"], hospital: ["D9-2"],
  // Commons has no federal W20-1 upload; CW20-1 is the identical-artwork
  // California variant (the legacy app used the same fallback).
  roadwork: ["W20-1", "CW20-1"],
};
const SERIES_DIR = { R: "regulatory", W: "warning", S: "school", D: "guide", C: "warning" };

function resolveSign(key) {
  const candidates = SIGN_CODES[key];
  if (!candidates) throw new Error(`unmapped legacy sign key: ${key}`);
  for (const code of candidates) {
    const dir = SERIES_DIR[code[0]];
    const rel = `traffic_signs/${dir}/MUTCD_${code}.svg`;
    if (existsSync(join(ROOT, rel))) return { code, image: rel };
  }
  throw new Error(`no sign file on disk for '${key}' (tried ${candidates.join(", ")})`);
}

// ---- extract the Q array literal from the legacy HTML ----
const html = readFileSync(LEGACY, "utf-8");
const start = html.indexOf("const Q = [");
if (start === -1) throw new Error("legacy Q array not found");
// find the matching closing '];' by bracket depth
let depth = 0, end = -1;
for (let i = html.indexOf("[", start); i < html.length; i++) {
  if (html[i] === "[") depth++;
  else if (html[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const legacyQ = new Function(`return ${html.slice(html.indexOf("[", start), end)}`)();
console.log(`extracted ${legacyQ.length} legacy questions`);

// ---- transform ----
const counters = {};
const questions = legacyQ.map((q) => {
  const section = q.cat === "signs" ? "signs" : "rules";
  counters[section] = (counters[section] ?? 0) + 1;
  const id = `oh-${section}-${String(counters[section]).padStart(3, "0")}`;
  const out = {
    id,
    section,
    category: q.cat === "signs" ? "signs" : q.cat,
    text: { "en-US": q.qe, "vi-VN": q.qv },
    choices: q.c.map(([vi, en]) => ({ text: { "en-US": en, "vi-VN": vi } })),
    answerIndex: q.a,
    explanation: { "en-US": q.ee, "vi-VN": q.ev },
    difficulty: 2,
    source: {
      title: "Digest of Ohio Motor Vehicle Laws (HSY 7607), Ohio BMV",
      url: "https://www.bmv.ohio.gov/links/hsy7607.pdf",
    },
  };
  if (q.sign) out.sign = resolveSign(q.sign);
  return out;
});

const bank = { stateCode: "oh", version: 1, questions };
writeFileSync(OUT, JSON.stringify(bank, null, 2) + "\n", "utf-8");
const signs = questions.filter((q) => q.section === "signs").length;
console.log(`wrote ${OUT}`);
console.log(`  sections: signs=${signs}, rules=${questions.length - signs}`);
console.log(`  categories: ${[...new Set(questions.map((q) => q.category))].join(", ")}`);
