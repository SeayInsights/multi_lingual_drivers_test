#!/usr/bin/env node
/**
 * Scaffold a new state for authoring (M4 pipeline).
 *
 *   node scripts/new-state.mjs <code> "<English name>" "<Vietnamese name>"
 *   e.g. node scripts/new-state.mjs ca "California" "California"
 *
 * Creates:
 *   data/states/<code>/state.json     — schema-valid TEMPLATE (every value a
 *                                       placeholder that MUST be replaced from
 *                                       the research pass; see
 *                                       .planning/specs/state-sourcing-checklist.md)
 *   data/states/<code>/authoring/     — empty batch directory
 * and registers the state as status "draft" in data/states/index.json
 * (hidden from the picker; exempt from bank sufficiency until flipped).
 *
 * The template deliberately uses example.com URLs so that a draft can never
 * silently graduate: replace them during research, and the ship gate's
 * spot-check (checklist §D) catches anything left behind.
 *
 * Refuses to touch a state that already exists (directory or registry entry).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [code, nameEn, nameVi] = process.argv.slice(2);

if (!code || !nameEn) {
  console.error('usage: node scripts/new-state.mjs <code> "<English name>" ["<Vietnamese name>"]');
  process.exit(1);
}
if (!/^[a-z]{2}$/.test(code)) {
  console.error(`new-state: '${code}' is not a lowercase two-letter state code`);
  process.exit(1);
}

const dir = join(ROOT, "data", "states", code);
const registryFile = join(ROOT, "data", "states", "index.json");
const registry = JSON.parse(readFileSync(registryFile, "utf-8"));

if (existsSync(dir)) {
  console.error(`new-state: data/states/${code}/ already exists`);
  process.exit(1);
}
if (registry.states.some((s) => s.code === code)) {
  console.error(`new-state: '${code}' is already registered in data/states/index.json`);
  process.exit(1);
}

const name = { "en-US": nameEn, "vi-VN": nameVi || nameEn };

// Schema-valid placeholders. Every value below is FICTIONAL until the
// research pass replaces it — that is what status "draft" means.
const template = {
  code,
  name,
  agency: {
    name: {
      "en-US": `${nameEn} — RESEARCH: official testing agency name`,
      "vi-VN": `${name["vi-VN"]} — RESEARCH: tên cơ quan (xem checklist)`,
    },
    abbreviation: "TODO",
    website: "https://example.com/RESEARCH-agency-website",
    handbookUrl: "https://example.com/RESEARCH-official-handbook",
  },
  test: {
    totalQuestions: 40,
    passingRule: "overall",
    overallMinCorrect: 32,
    timeLimitMinutes: null,
    sections: [
      {
        id: "signs",
        name: { "en-US": "Road signs", "vi-VN": "Biển báo giao thông" },
        questionCount: 20,
        minCorrect: 0,
      },
      {
        id: "rules",
        name: { "en-US": "Road rules", "vi-VN": "Luật giao thông" },
        questionCount: 20,
        minCorrect: 0,
      },
    ],
  },
  licensing: {
    minPermitAge: 16,
    notes: {
      "en-US": "RESEARCH: test format and permit facts from the official handbook.",
      "vi-VN": "RESEARCH: điền thông tin thi và giấy phép từ sổ tay chính thức.",
    },
  },
  content: { nationalSigns: true },
  sources: [
    {
      title: "RESEARCH: replace with the official sources used (state-sourcing-checklist.md §A)",
      url: "https://example.com/RESEARCH",
      accessed: new Date().toISOString().slice(0, 10),
    },
  ],
};

mkdirSync(join(dir, "authoring"), { recursive: true });
writeFileSync(join(dir, "state.json"), JSON.stringify(template, null, 2) + "\n", "utf-8");

registry.states.push({ code, name, status: "draft" });
registry.version += 1;
writeFileSync(registryFile, JSON.stringify(registry, null, 2) + "\n", "utf-8");

console.log(`scaffolded data/states/${code}/ (draft, registry v${registry.version})`);
console.log("next steps:");
console.log(`  1. research pass  -> .planning/specs/state-sourcing-checklist.md §A`);
console.log(`  2. fill            data/states/${code}/state.json (§B)`);
console.log(`  3. author batches  data/states/${code}/authoring/ (§C)`);
console.log(`  4. build           node scripts/build-questions.mjs ${code}`);
console.log(`  5. flip to 'available' in data/states/index.json when §D passes`);
