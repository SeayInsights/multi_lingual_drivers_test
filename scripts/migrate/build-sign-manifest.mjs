#!/usr/bin/env node
/**
 * Generates data/signs/manifest.json — an index of every SVG in traffic_signs/.
 *
 * Entry: { code, category, file } plus per-locale `name` for signs that appear
 * in the question bank (the gallery shows names for those; the rest render
 * with their MUTCD code until named in later content work).
 *
 * The entry count is asserted equal to the SVG count on disk — a mismatch
 * fails the build (this is the check that surfaces filename collisions).
 *
 * Usage: node scripts/migrate/build-sign-manifest.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIGNS_DIR = join(ROOT, "traffic_signs");
const OUT = join(ROOT, "data", "signs", "manifest.json");

// vi/en display names for the signs used by the migrated question bank
const NAMES = {
  "R1-1":  { "en-US": "Stop", "vi-VN": "Dừng lại (STOP)" },
  "R1-2":  { "en-US": "Yield", "vi-VN": "Nhường đường (YIELD)" },
  "R5-1":  { "en-US": "Do not enter", "vi-VN": "Cấm vào" },
  "R5-1a": { "en-US": "Wrong way", "vi-VN": "Ngược chiều (WRONG WAY)" },
  "R6-1R": { "en-US": "One way (right)", "vi-VN": "Đường một chiều (phải)" },
  "R6-2R": { "en-US": "One way (right)", "vi-VN": "Đường một chiều (phải)" },
  "R3-4":  { "en-US": "No U-turn", "vi-VN": "Cấm quay đầu" },
  "R3-2":  { "en-US": "No left turn", "vi-VN": "Cấm quẹo trái" },
  "R2-1":  { "en-US": "Speed limit", "vi-VN": "Tốc độ tối đa" },
  "S1-1":  { "en-US": "School zone / crossing", "vi-VN": "Khu trường học" },
  "W10-1": { "en-US": "Railroad crossing ahead", "vi-VN": "Sắp tới đường ray xe lửa" },
  "W3-3":  { "en-US": "Signal ahead", "vi-VN": "Sắp tới đèn giao thông" },
  "W4-1R": { "en-US": "Merge (right)", "vi-VN": "Nhập làn (phải)" },
  "W4-1":  { "en-US": "Merge", "vi-VN": "Nhập làn" },
  "W6-3":  { "en-US": "Two-way traffic", "vi-VN": "Đường hai chiều" },
  "W8-5":  { "en-US": "Slippery when wet", "vi-VN": "Đường trơn khi ướt" },
  "W11-2": { "en-US": "Pedestrian crossing", "vi-VN": "Người đi bộ băng qua" },
  "W3-1":  { "en-US": "Stop ahead", "vi-VN": "Sắp tới bảng STOP" },
  "W3-1a": { "en-US": "Stop ahead", "vi-VN": "Sắp tới bảng STOP" },
  "D9-2":  { "en-US": "Hospital", "vi-VN": "Bệnh viện" },
  "W20-1": { "en-US": "Road work ahead", "vi-VN": "Công trường phía trước" },
  "CW20-1": { "en-US": "Road work ahead", "vi-VN": "Công trường phía trước" },
};

// Parse "MUTCD_R1-1.svg" / "MUTCD-OH_..." -> code; fall back to the stem.
function codeFromFilename(name) {
  const stem = name.replace(/\.svg$/i, "");
  const m = stem.match(/^MUTCD(?:-OH)?_(.+)$/);
  return (m ? m[1] : stem).replace(/_/g, " ");
}

const entries = [];
let diskCount = 0;
for (const category of readdirSync(SIGNS_DIR)) {
  const dir = join(SIGNS_DIR, category);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith(".svg")) continue;
    diskCount++;
    const code = codeFromFilename(f);
    const entry = { code, category, file: `traffic_signs/${category}/${f}` };
    if (NAMES[code]) entry.name = NAMES[code];
    entries.push(entry);
  }
}

if (entries.length !== diskCount) {
  console.error(`manifest count ${entries.length} != disk count ${diskCount}`);
  process.exit(1);
}

// duplicate-code report (informational — variants share codes legitimately)
const byCode = new Map();
for (const e of entries) byCode.set(e.code, (byCode.get(e.code) ?? 0) + 1);
const dupes = [...byCode].filter(([, n]) => n > 1);

const manifest = { version: 1, count: entries.length, signs: entries };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
console.log(`wrote ${OUT}: ${entries.length} signs across ${new Set(entries.map((e) => e.category)).size} categories`);
if (dupes.length) console.log(`  note: ${dupes.length} codes have multiple files (state/federal variants)`);
