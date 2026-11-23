#!/usr/bin/env node
// Validate the question bank (I1), including that every referenced image exists.
// Usage: node scripts/validate-bank.mjs [bank file]   (default: bank/bank.json)
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBank } from "../js/bank.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
const bankFile = resolve(process.argv[2] ?? join(repo, "bank", "bank.json"));
const bankDir = dirname(bankFile);

let bank;
try {
  bank = JSON.parse(readFileSync(bankFile, "utf8"));
} catch (e) {
  console.error(`${bankFile}: ${e.message}`);
  process.exit(1);
}

const errors = validateBank(bank, { imageExists: (p) => existsSync(join(bankDir, p)) });
if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`${errors.length} error(s) in ${bankFile}`);
  process.exit(1);
}
console.log(`OK: ${bank.questions.length} question(s), nextId ${bank.nextId}`);
