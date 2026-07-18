#!/usr/bin/env node
/** Rasterize assets/icons/icon.svg into the PWA icon set (sharp, dev-only). */
import sharp from "sharp";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets", "icons", "icon.svg");
const OUT = join(ROOT, "assets", "icons");

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-192.png", 192],
  ["maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of targets) {
  await sharp(SRC).resize(size, size).png().toFile(join(OUT, name));
  console.log(`  ${name} (${size}px)`);
}
console.log("icons built");
