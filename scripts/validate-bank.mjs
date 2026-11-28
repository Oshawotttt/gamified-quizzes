#!/usr/bin/env node
// Validate question banks, including that every referenced image exists.
// Usage: node scripts/validate-bank.mjs [bank file]
//   With a bank file: validate that one file (images relative to its folder).
//   With no argument: validate banks/index.json and every bank it lists
//   (banks/<id>/bank.json).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBank, validateIndex } from "../js/bank.js";

const repo = fileURLToPath(new URL("..", import.meta.url));

function readJson(file) {
  try {
    return { json: JSON.parse(readFileSync(file, "utf8")) };
  } catch (e) {
    return { error: `${file}: ${e.message}` };
  }
}

/** Validate one bank file; returns the error count and prints the result. */
function checkBank(bankFile, label) {
  const { json: bank, error } = readJson(bankFile);
  if (error) {
    console.error(error);
    return 1;
  }
  const bankDir = dirname(bankFile);
  const errors = validateBank(bank, { imageExists: (p) => existsSync(join(bankDir, p)) });
  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error(`${errors.length} error(s) in ${bankFile}`);
    return errors.length;
  }
  console.log(`OK${label ? ` ${label}` : ""}: ${bank.questions.length} question(s), nextId ${bank.nextId}`);
  return 0;
}

if (process.argv[2]) {
  process.exit(checkBank(resolve(process.argv[2])) ? 1 : 0);
}

const banksDir = join(repo, "banks");
const indexFile = join(banksDir, "index.json");
const { json: index, error } = readJson(indexFile);
if (error) {
  console.error(error);
  process.exit(1);
}
const indexErrors = validateIndex(index);
if (indexErrors.length) {
  for (const e of indexErrors) console.error(e);
  console.error(`${indexErrors.length} error(s) in ${indexFile}`);
  process.exit(1);
}

let failed = 0;
for (const { id } of index.banks) {
  const bankFile = join(banksDir, id, "bank.json");
  if (!existsSync(bankFile)) {
    console.error(`${id}: listed in ${indexFile} but ${bankFile} does not exist`);
    failed++;
    continue;
  }
  if (checkBank(bankFile, id)) failed++;
}
process.exit(failed ? 1 : 0);
