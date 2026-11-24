#!/usr/bin/env node
// Validate an import file (I2) against the question bank rules, without a bank.
// Usage: node validate-import.mjs <import file>
// Rules come from lib/import.js (copied in by the installer) or, inside the
// gamified-quizzes repo, from js/import.js.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

let planImport;
try {
  ({ planImport } = await import("./lib/import.js"));
} catch {
  ({ planImport } = await import("../../../js/import.js"));
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node validate-import.mjs <import file>");
  process.exit(1);
}
const importFile = resolve(file);

let importJson;
try {
  importJson = JSON.parse(readFileSync(importFile, "utf8"));
} catch (e) {
  console.error(`${importFile}: ${e.message}`);
  process.exit(1);
}

const emptyBank = { version: 1, nextId: 1, questions: [] };
const plan = planImport(emptyBank, importJson, {
  imageExists: (p) => existsSync(join(dirname(importFile), p)),
  today: "2000-01-01",
});

if (plan.errors.length) {
  for (const e of plan.errors) console.error(e);
  console.error(`${plan.errors.length} error(s) in ${importFile}`);
  process.exit(1);
}
for (const s of plan.skipped) console.log(`duplicate stem: questions[${s.index}] repeats an earlier question`);
console.log(`OK: ${plan.added.length} question(s) valid`);
