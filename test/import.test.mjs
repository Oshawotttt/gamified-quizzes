import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planImport } from "../js/import.js";

const repo = fileURLToPath(new URL("..", import.meta.url));

function choice(stem, extra = {}) {
  return {
    type: "single",
    stem,
    options: [
      { key: "a", text: "Yes", explanation: "Because it is." },
      { key: "b", text: "No", explanation: "Because it is not." },
    ],
    answer: ["a"],
    ...extra,
  };
}

function bankWith(nextId, questions = []) {
  return { version: 1, nextId, questions };
}

function existing(id, stem) {
  return { id, ...choice(stem), quiz: "Old quiz", addedAt: "2026-11-01" };
}

const noImages = () => false;

test("valid questions get ids from nextId, the import title and the given date", () => {
  const bank = bankWith(5, [existing("q0004", "Old question?")]);
  const imp = { version: 1, title: "New quiz", questions: [choice("One?"), choice("Two?"), choice("Three?")] };
  const r = planImport(bank, imp, { imageExists: noImages, today: "2026-11-24" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.added.map((q) => q.id), ["q0005", "q0006", "q0007"]);
  assert.equal(r.newBank.nextId, 8);
  assert.equal(r.newBank.questions.length, 4);
  for (const q of r.newBank.questions.slice(1)) {
    assert.equal(q.quiz, "New quiz");
    assert.equal(q.addedAt, "2026-11-24");
  }
  assert.deepEqual(r.newBank.questions[0], bank.questions[0]);
});

test("an invalid question gives errors naming its index and field, and no new bank", () => {
  const withId = { ...choice("Has id?"), id: "q0001" };
  const noExplanation = choice("No explanation?");
  delete noExplanation.options[1].explanation;
  const imp = { version: 1, title: "Bad quiz", questions: [choice("Fine?"), withId, noExplanation] };
  const r = planImport(bankWith(1), imp, { imageExists: noImages, today: "2026-11-24" });
  assert.equal(r.newBank, null);
  assert.ok(r.errors.some((e) => /questions\[1\]\.id/.test(e)), r.errors.join("\n"));
  assert.ok(r.errors.some((e) => /questions\[2\]\.options\[1\]\.explanation/.test(e)), r.errors.join("\n"));
  assert.ok(!r.errors.some((e) => /questions\[0\]/.test(e)), r.errors.join("\n"));
});

test("a stem equal to an existing stem except for case and whitespace is skipped", () => {
  const bank = bankWith(2, [existing("q0001", "What is  a\nProcess?")]);
  const imp = { version: 1, title: "Quiz", questions: [choice("  what is a   process? "), choice("What is a thread?")] };
  const r = planImport(bank, imp, { imageExists: noImages, today: "2026-11-24" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].index, 0);
  assert.equal(r.skipped[0].duplicateOf, "q0001");
  assert.deepEqual(r.added.map((q) => q.stem), ["What is a thread?"]);
  assert.deepEqual(r.added.map((q) => q.id), ["q0002"]);
  assert.equal(r.newBank.nextId, 3);
});

test("image paths are rewritten to id-prefixed bank paths and listed as copies", () => {
  const q = choice("Which animal?");
  q.options[0].text = "![p](images/cat.png)";
  const imp = { version: 1, title: "Quiz", questions: [q] };
  const r = planImport(bankWith(5), imp, { imageExists: (p) => p === "images/cat.png", today: "2026-11-24" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.added[0].options[0].text, "![p](images/q0005-cat.png)");
  assert.deepEqual(r.imageCopies, [{ from: "images/cat.png", to: "images/q0005-cat.png" }]);
});

test("a missing image in the import file is an error", () => {
  const q = choice("![p](images/dog.png) Which animal?");
  const r = planImport(bankWith(1), { version: 1, title: "Quiz", questions: [q] }, { imageExists: noImages, today: "2026-11-24" });
  assert.equal(r.newBank, null);
  assert.ok(r.errors.some((e) => /questions\[0\]\.stem.*images\/dog\.png/.test(e)), r.errors.join("\n"));
});

test("a missing title is an error", () => {
  const r = planImport(bankWith(1), { version: 1, questions: [choice("A?")] }, { imageExists: noImages, today: "2026-11-24" });
  assert.equal(r.newBank, null);
  assert.ok(r.errors.some((e) => /^title/.test(e)), r.errors.join("\n"));
});

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "repo-"));
  for (const d of ["js", "scripts", "bank"]) cpSync(join(repo, d), join(dir, d), { recursive: true });
  cpSync(join(repo, "package.json"), join(dir, "package.json"));
  return dir;
}

function writeImport(dir, imp, images = {}) {
  const importDir = join(dir, "incoming");
  mkdirSync(join(importDir, "images"), { recursive: true });
  for (const [name, content] of Object.entries(images)) writeFileSync(join(importDir, "images", name), content);
  const file = join(importDir, "quiz.json");
  writeFileSync(file, JSON.stringify(imp));
  return file;
}

const run = (dir, args) => spawnSync(process.execPath, [join(dir, "scripts", "add-quiz.mjs"), ...args], { cwd: dir, encoding: "utf8" });

test("add-quiz --dry-run leaves bank.json byte-identical and exits 0", () => {
  const dir = tempRepo();
  const before = readFileSync(join(dir, "bank", "bank.json"));
  const q = choice("A brand new question with a picture? ![p](images/cat.png)");
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [q] }, { "cat.png": "png" });
  const r = run(dir, [file, "--dry-run"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(readFileSync(join(dir, "bank", "bank.json")).equals(before));
  assert.ok(!existsSync(join(dir, "bank", "images", "q" + String(JSON.parse(before).nextId).padStart(4, "0") + "-cat.png")));
  assert.match(r.stdout, /added 1/i);
});

test("add-quiz exits 1 on an invalid file and writes nothing", () => {
  const dir = tempRepo();
  const before = readFileSync(join(dir, "bank", "bank.json"));
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [{ ...choice("Bad?"), id: "q0001" }] });
  const r = run(dir, [file]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /questions\[0\]\.id/);
  assert.ok(readFileSync(join(dir, "bank", "bank.json")).equals(before));
});

test("add-quiz appends questions, copies images and leaves the import file in place", () => {
  const dir = tempRepo();
  const bankFile = join(dir, "bank", "bank.json");
  const start = JSON.parse(readFileSync(bankFile, "utf8"));
  const id = "q" + String(start.nextId).padStart(4, "0");
  const q = choice("A brand new question with a picture? ![p](images/cat.png)");
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [q] }, { "cat.png": "png" });
  const r = run(dir, [file]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const bank = JSON.parse(readFileSync(bankFile, "utf8"));
  assert.equal(bank.questions.length, start.questions.length + 1);
  assert.equal(bank.questions.at(-1).id, id);
  assert.equal(readFileSync(join(dir, "bank", "images", `${id}-cat.png`), "utf8"), "png");
  assert.ok(existsSync(file));
  assert.match(r.stdout, new RegExp(id));
  const v = spawnSync(process.execPath, [join(dir, "scripts", "validate-bank.mjs")], { encoding: "utf8" });
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test("add-quiz exits 1 when the import file is missing", () => {
  const dir = tempRepo();
  const r = run(dir, [join(dir, "nope.json")]);
  assert.equal(r.status, 1);
});
