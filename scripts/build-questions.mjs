#!/usr/bin/env node
/**
 * Question-bank build: composes one state's shipped bank from its sources.
 *
 *   data/states/<code>/base-questions.json      (optional — Ohio's 57 migrated legacy questions)
 * + data/questions/national-signs.json          (only when state.json content.nationalSigns is true;
 *                                                ids stamped us-signs-NNN -> <code>-signs-NNN)
 * + data/states/<code>/authoring/*.json         (arrays of question objects)
 * = data/states/<code>/questions.json           (the shipped bank)
 *
 * Guarantees, enforced loudly:
 *  - every legacy question id survives unchanged (history keys on ids)
 *  - ids unique across the whole bank
 *  - the bank is never empty
 *  - bank version tracks content for cache busting:
 *      self-authored state (Ohio):  1 + number of batch files   (unchanged since M3)
 *      national-signs state:        pool version + number of batch files
 * Schema/cross-field validity is enforced by validate-data.mjs afterwards.
 *
 * Usage: node scripts/build-questions.mjs [state]   (default: oh)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const code = process.argv[2] ?? "oh";
const dir = join(ROOT, "data", "states", code);

const stateFile = join(dir, "state.json");
if (!existsSync(stateFile)) {
  console.error(`build-questions: ${stateFile} not found — unknown state '${code}'`);
  process.exit(1);
}
const state = JSON.parse(readFileSync(stateFile, "utf-8"));

const baseFile = join(dir, "base-questions.json");
const base = existsSync(baseFile)
  ? JSON.parse(readFileSync(baseFile, "utf-8"))
  : { stateCode: code, questions: [] };

const questions = [...base.questions];
const seen = new Set(questions.map((q) => q.id));

// National MUTCD signs pool — shared across states, ids stamped per state.
let poolVersion = 0;
if (state.content?.nationalSigns === true) {
  const pool = JSON.parse(
    readFileSync(join(ROOT, "data", "questions", "national-signs.json"), "utf-8")
  );
  poolVersion = pool.version;
  for (const q of pool.questions) {
    const stamped = structuredClone(q);
    stamped.id = q.id.replace(/^us-/, `${code}-`);
    if (seen.has(stamped.id)) {
      console.error(`build-questions: national pool id '${stamped.id}' collides with existing question`);
      process.exit(1);
    }
    seen.add(stamped.id);
    questions.push(stamped);
  }
}

const authoringDir = join(dir, "authoring");
const batchFiles = existsSync(authoringDir)
  ? readdirSync(authoringDir).filter((f) => f.endsWith(".json")).sort()
  : [];

let added = 0;
for (const f of batchFiles) {
  const batch = JSON.parse(readFileSync(join(authoringDir, f), "utf-8"));
  if (!Array.isArray(batch)) {
    console.error(`build-questions: ${f} must be a JSON array of questions`);
    process.exit(1);
  }
  for (const q of batch) {
    if (seen.has(q.id)) {
      console.error(`build-questions: duplicate id '${q.id}' in ${f}`);
      process.exit(1);
    }
    seen.add(q.id);
    questions.push(q);
    added++;
  }
}

// legacy preservation: every base id must still be present, unmodified count
for (const q of base.questions) {
  if (!seen.has(q.id)) {
    console.error(`build-questions: legacy id '${q.id}' missing from output`);
    process.exit(1);
  }
}

if (questions.length === 0) {
  console.error(`build-questions: '${code}' produced an empty bank (no base, no national pool, no batches)`);
  process.exit(1);
}

const version = (poolVersion || 1) + batchFiles.length;
const out = { stateCode: code, version, questions };
writeFileSync(join(dir, "questions.json"), JSON.stringify(out, null, 2) + "\n", "utf-8");
const bySection = {};
for (const q of questions) bySection[q.section] = (bySection[q.section] ?? 0) + 1;
console.log(`questions.json: ${questions.length} total (${added} authored across ${batchFiles.length} batches) — ${Object.entries(bySection).map(([s, n]) => `${s}=${n}`).join(", ")}`);
