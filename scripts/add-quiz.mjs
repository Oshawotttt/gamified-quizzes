#!/usr/bin/env node
// Add a quiz import file (I2) to the question bank.
// Usage: node scripts/add-quiz.mjs <import file> [--dry-run]
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planImport } from "../js/import.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
const bankDir = join(repo, "bank");
const bankFile = join(bankDir, "bank.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => a !== "--dry-run");
if (files.length !== 1) {
  console.error("Usage: node scripts/add-quiz.mjs <import file> [--dry-run]");
  process.exit(1);
}
const importFile = resolve(files[0]);
const importDir = dirname(importFile);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`${file}: ${e.message}`);
    process.exit(1);
  }
}

function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const bank = readJson(bankFile);
const importJson = readJson(importFile);

const plan = planImport(bank, importJson, {
  imageExists: (p) => existsSync(join(importDir, p)),
  bankImageExists: (p) => existsSync(join(bankDir, p)),
  today: localDate(),
});

if (plan.errors.length) {
  for (const e of plan.errors) console.error(e);
  console.error(`${plan.errors.length} error(s) in ${importFile}; nothing written`);
  process.exit(1);
}

for (const s of plan.skipped) {
  console.log(`skipped questions[${s.index}]: same stem as ${s.duplicateOf}`);
}
const range = plan.added.length ? ` (${plan.added[0].id}-${plan.added.at(-1).id})` : "";
console.log(`added ${plan.added.length}${range}, skipped ${plan.skipped.length} duplicate(s)`);

if (dryRun) {
  console.log("dry run: nothing written");
  process.exit(0);
}
if (plan.added.length === 0) {
  console.log("nothing to add; bank unchanged");
  process.exit(0);
}

for (const c of plan.imageCopies) {
  copyFileSync(join(importDir, c.from), join(bankDir, c.to));
}
writeFileSync(bankFile, JSON.stringify(plan.newBank, null, 2) + "\n");
console.log(`wrote ${bankFile}`);
