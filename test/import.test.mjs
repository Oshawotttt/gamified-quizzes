import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
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

test("re-importing a question with an image skips it as a duplicate", () => {
  const imp = { version: 1, title: "Quiz", questions: [choice("Which animal? ![p](images/cat.png)")] };
  const opts = { imageExists: (p) => p === "images/cat.png", today: "2026-11-24" };
  const first = planImport(bankWith(5), imp, opts);
  const again = planImport(first.newBank, imp, opts);
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.added, []);
  assert.equal(again.skipped[0]?.duplicateOf, "q0005");
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
  for (const d of ["js", "scripts", "banks"]) cpSync(join(repo, d), join(dir, d), { recursive: true });
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
const validate = (dir) => spawnSync(process.execPath, [join(dir, "scripts", "validate-bank.mjs")], { encoding: "utf8" });
const bankPath = (dir, id) => join(dir, "banks", id, "bank.json");
const indexPath = (dir) => join(dir, "banks", "index.json");

/** Temp repo with a second bank "other" holding one question. */
function tempRepoWithOther() {
  const dir = tempRepo();
  mkdirSync(join(dir, "banks", "other", "images"), { recursive: true });
  writeFileSync(bankPath(dir, "other"), JSON.stringify(bankWith(2, [existing("q0001", "Shared stem?")]), null, 2) + "\n");
  const index = JSON.parse(readFileSync(indexPath(dir), "utf8"));
  index.banks.push({ id: "other", name: "Other" });
  writeFileSync(indexPath(dir), JSON.stringify(index, null, 2) + "\n");
  return dir;
}

/** Everything a failed or dry run must leave untouched. */
function snapshot(dir) {
  return {
    folders: readdirSync(join(dir, "banks")).sort(),
    index: readFileSync(indexPath(dir)),
    cs203: readFileSync(bankPath(dir, "cs203")),
    cs203Images: readdirSync(join(dir, "banks", "cs203", "images")).sort(),
  };
}

function assertUnchanged(dir, before) {
  const after = snapshot(dir);
  assert.deepEqual(after.folders, before.folders);
  assert.ok(after.index.equals(before.index), "index changed");
  assert.ok(after.cs203.equals(before.cs203), "cs203 bank changed");
  assert.deepEqual(after.cs203Images, before.cs203Images);
}

const catQuiz = () => ({ version: 1, title: "Quiz", questions: [choice("A brand new question with a picture? ![p](images/cat.png)")] });

test("add-quiz --bank cs203 --dry-run leaves the bank and index byte-identical and exits 0", () => {
  const dir = tempRepo();
  const before = snapshot(dir);
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--bank", "cs203", "--dry-run"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assertUnchanged(dir, before);
  assert.match(r.stdout, /added 1/i);
});

test("add-quiz exits 1 on an invalid file and writes nothing", () => {
  const dir = tempRepo();
  const before = snapshot(dir);
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [{ ...choice("Bad?"), id: "q0001" }] });
  const r = run(dir, [file, "--bank", "cs203"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /questions\[0\]\.id/);
  assertUnchanged(dir, before);
});

test("add-quiz --bank appends to that bank, copies images there and leaves other banks and the index alone", () => {
  const dir = tempRepoWithOther();
  const before = snapshot(dir);
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--bank", "other"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const bank = JSON.parse(readFileSync(bankPath(dir, "other"), "utf8"));
  assert.deepEqual(bank.questions.map((q) => q.id), ["q0001", "q0002"]);
  assert.equal(readFileSync(join(dir, "banks", "other", "images", "q0002-cat.png"), "utf8"), "png");
  assertUnchanged(dir, before);
  assert.ok(existsSync(file));
  assert.match(r.stdout, /q0002/);
  const v = validate(dir);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test("add-quiz --new creates the bank folder, starts ids at q0001 and appends the bank to the index", () => {
  const dir = tempRepo();
  const indexBefore = JSON.parse(readFileSync(indexPath(dir), "utf8"));
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [choice("First?"), choice("Second?")] });
  const r = run(dir, [file, "--new", "demo", "--name", "Demo Bank"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const bank = JSON.parse(readFileSync(bankPath(dir, "demo"), "utf8"));
  assert.equal(bank.version, 1);
  assert.deepEqual(bank.questions.map((q) => q.id), ["q0001", "q0002"]);
  assert.equal(bank.nextId, 3);
  assert.ok(existsSync(join(dir, "banks", "demo", "images")));
  const index = JSON.parse(readFileSync(indexPath(dir), "utf8"));
  assert.deepEqual(index.banks, [...indexBefore.banks, { id: "demo", name: "Demo Bank" }]);
  const v = validate(dir);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test("add-quiz --new copies images into the new bank folder", () => {
  const dir = tempRepo();
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--new", "demo", "--name", "Demo Bank"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(dir, "banks", "demo", "images", "q0001-cat.png"), "utf8"), "png");
});

test("add-quiz --new with --dry-run creates no folder and leaves the index byte-identical", () => {
  const dir = tempRepo();
  const before = snapshot(dir);
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--new", "demo", "--name", "Demo Bank", "--dry-run"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /added 1/i);
  assert.ok(!existsSync(join(dir, "banks", "demo")));
  assertUnchanged(dir, before);
});

test("add-quiz --new with an invalid import creates no folder and leaves the index byte-identical", () => {
  const dir = tempRepo();
  const before = snapshot(dir);
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [{ ...choice("Bad?"), id: "q0001" }] });
  const r = run(dir, [file, "--new", "demo", "--name", "Demo Bank"]);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(join(dir, "banks", "demo")));
  assertUnchanged(dir, before);
});

const badArgs = [
  ["neither --bank nor --new", []],
  ["both --bank and --new", ["--bank", "cs203", "--new", "demo", "--name", "Demo"]],
  ["--new without --name", ["--new", "demo"]],
  ["--name with --bank", ["--bank", "cs203", "--name", "CS"]],
  ["--new with an id already in the index", ["--new", "cs203", "--name", "Again"]],
  ["--bank with an unknown id", ["--bank", "nope"]],
  ["--new with an invalid id", ["--new", "Bad Id", "--name", "Bad"]],
  ["--bank without a value", ["--bank"]],
];

for (const [name, args] of badArgs) {
  test(`add-quiz exits 1 and writes nothing for: ${name}`, () => {
    const dir = tempRepo();
    const before = snapshot(dir);
    const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
    const r = run(dir, [file, ...args]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assertUnchanged(dir, before);
  });
}

test("add-quiz --new exits 1 and writes nothing when banks/<id>/ exists but is not in the index", () => {
  const dir = tempRepo();
  mkdirSync(join(dir, "banks", "demo"));
  writeFileSync(join(dir, "banks", "demo", "keep.txt"), "x");
  const before = snapshot(dir);
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--new", "demo", "--name", "Demo"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assertUnchanged(dir, before);
  assert.deepEqual(readdirSync(join(dir, "banks", "demo")), ["keep.txt"]);
});

test("add-quiz --bank with an unknown id lists the known ids", () => {
  const dir = tempRepoWithOther();
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--bank", "nope"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cs203/);
  assert.match(r.stderr, /other/);
});

test("a stem that exists in one bank is added, not skipped, when importing into another", () => {
  const dir = tempRepoWithOther();
  const file = writeImport(dir, { version: 1, title: "Quiz", questions: [choice("Shared stem?")] });
  const r = run(dir, [file, "--bank", "cs203"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /added 1/i);
  const bank = JSON.parse(readFileSync(bankPath(dir, "cs203"), "utf8"));
  assert.equal(bank.questions.at(-1).stem, "Shared stem?");
});

test("add-quiz exits 1 when the import file is missing", () => {
  const dir = tempRepo();
  const r = run(dir, [join(dir, "nope.json"), "--bank", "cs203"]);
  assert.equal(r.status, 1);
});

test("add-quiz --bank copies images into a bank that has no images/ folder yet", () => {
  const dir = tempRepoWithOther();
  rmSync(join(dir, "banks", "other", "images"), { recursive: true });
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--bank", "other"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(dir, "banks", "other", "images", "q0002-cat.png"), "utf8"), "png");
});

test("add-quiz exits 1 and writes nothing when banks/index.json is invalid", () => {
  const dir = tempRepo();
  writeFileSync(indexPath(dir), JSON.stringify({ version: 1 }));
  const before = snapshot(dir);
  const file = writeImport(dir, catQuiz(), { "cat.png": "png" });
  const r = run(dir, [file, "--new", "demo", "--name", "Demo"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /banks/);
  assertUnchanged(dir, before);
});
