#!/usr/bin/env node
// Add a quiz import file (I2) to a question bank.
// Usage:
//   node scripts/add-quiz.mjs <import file> --bank <id> [--dry-run]
//   node scripts/add-quiz.mjs <import file> --new <id> --name "<display name>" [--dry-run]
// --bank adds to a bank listed in banks/index.json. --new creates banks/<id>/
// (bank.json and images/) and appends { id, name } to the end of the index.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BANK_ID_PATTERN, validateIndex } from "../js/bank.js";
import { planImport } from "../js/import.js";

const USAGE = [
  "Usage: node scripts/add-quiz.mjs <import file> --bank <id> [--dry-run]",
  '       node scripts/add-quiz.mjs <import file> --new <id> --name "<display name>" [--dry-run]',
].join("\n");

const repo = fileURLToPath(new URL("..", import.meta.url));
const banksDir = join(repo, "banks");
const indexFile = join(banksDir, "index.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { files: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--bank" || a === "--new" || a === "--name") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) fail(`${a} needs a value\n${USAGE}`);
      if (a.slice(2) in opts) fail(`${a} given twice\n${USAGE}`);
      opts[a.slice(2)] = value;
    } else if (a.startsWith("--")) fail(`unknown option ${a}\n${USAGE}`);
    else opts.files.push(a);
  }
  if (opts.files.length !== 1) fail(USAGE);
  if ((opts.bank === undefined) === (opts.new === undefined)) fail(`give exactly one of --bank or --new\n${USAGE}`);
  if (opts.new !== undefined && opts.name === undefined) fail(`--new needs --name\n${USAGE}`);
  if (opts.bank !== undefined && opts.name !== undefined) fail(`--name is only for --new\n${USAGE}`);
  return opts;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${file}: ${e.message}`);
  }
}

const writeJson = (file, json) => writeFileSync(file, JSON.stringify(json, null, 2) + "\n");

function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const opts = parseArgs(process.argv.slice(2));
const index = readJson(indexFile);
const indexErrors = validateIndex(index);
if (indexErrors.length) {
  for (const e of indexErrors) console.error(e);
  fail(`${indexErrors.length} error(s) in ${indexFile}; nothing written`);
}
const knownIds = index.banks.map((b) => b.id);

let bankId;
let bank;
if (opts.bank !== undefined) {
  bankId = opts.bank;
  if (!knownIds.includes(bankId)) fail(`unknown bank ${JSON.stringify(bankId)}; known banks: ${knownIds.join(", ") || "(none)"}`);
  bank = readJson(join(banksDir, bankId, "bank.json"));
} else {
  bankId = opts.new;
  if (!BANK_ID_PATTERN.test(bankId)) fail(`--new id must match ${BANK_ID_PATTERN} (got ${JSON.stringify(bankId)})`);
  if (opts.name.trim() === "") fail("--name must not be empty");
  if (knownIds.includes(bankId)) fail(`bank ${bankId} is already in ${indexFile}`);
  if (existsSync(join(banksDir, bankId))) fail(`${join(banksDir, bankId)} already exists`);
  bank = { version: 1, nextId: 1, questions: [] };
}

const bankDir = join(banksDir, bankId);
const bankFile = join(bankDir, "bank.json");
const importFile = resolve(opts.files[0]);
const importDir = dirname(importFile);
const importJson = readJson(importFile);

const plan = planImport(bank, importJson, {
  imageExists: (p) => existsSync(join(importDir, p)),
  bankImageExists: (p) => existsSync(join(bankDir, p)),
  today: localDate(),
});

if (plan.errors.length) {
  for (const e of plan.errors) console.error(e);
  fail(`${plan.errors.length} error(s) in ${importFile}; nothing written`);
}

for (const s of plan.skipped) {
  console.log(`skipped questions[${s.index}]: same stem as ${s.duplicateOf}`);
}
const range = plan.added.length ? ` (${plan.added[0].id}-${plan.added.at(-1).id})` : "";
console.log(`added ${plan.added.length}${range} to ${bankId}, skipped ${plan.skipped.length} duplicate(s)`);

if (opts.dryRun) {
  console.log("dry run: nothing written");
  process.exit(0);
}
if (plan.added.length === 0) {
  console.log("nothing to add; bank unchanged");
  process.exit(0);
}

// Git does not keep empty folders, so an existing bank may have no images/ yet.
mkdirSync(join(bankDir, "images"), { recursive: true });
for (const c of plan.imageCopies) {
  copyFileSync(join(importDir, c.from), join(bankDir, c.to));
}
writeJson(bankFile, plan.newBank);
console.log(`wrote ${bankFile}`);
if (opts.new !== undefined) {
  index.banks.push({ id: bankId, name: opts.name });
  writeJson(indexFile, index);
  console.log(`added ${bankId} (${opts.name}) to ${indexFile}`);
}
