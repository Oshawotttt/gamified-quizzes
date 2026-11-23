import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBank } from "../js/bank.js";

const IMAGES = new Set(["images/q0002-diagram.png", "images/q0003-chip.jpg"]);
const imageExists = (p) => IMAGES.has(p);

function validBank() {
  return {
    version: 1,
    nextId: 6,
    questions: [
      {
        id: "q0001",
        type: "single",
        points: 2,
        stem: "Which register holds the **return address**?",
        options: [
          { key: "a", text: "`ra`", explanation: "The jump-and-link instruction writes the return address here." },
          { key: "b", text: "`sp`", explanation: "The stack pointer holds the top of the stack." },
          { key: "c", text: "`pc`", explanation: "The program counter holds the current instruction address." },
        ],
        answer: ["a"],
        explanation: "Calls save the return address in a dedicated register.",
        source: "own answer",
        quiz: "Sample quiz",
        addedAt: "2026-11-24",
      },
      {
        id: "q0002",
        type: "multi",
        stem: "Look at the diagram.\n\n![diagram](images/q0002-diagram.png)\n\nWhich are true?",
        options: [
          { key: "a", text: "A", explanation: "Correct: A holds." },
          { key: "b", text: "B", explanation: "Wrong: B does not hold." },
          { key: "c", text: "C", explanation: "Correct: C holds." },
        ],
        answer: ["a", "c"],
        quiz: "Sample quiz",
        addedAt: "2026-11-24T10:00:00Z",
      },
      {
        id: "q0003",
        type: "single",
        stem: "Which chip is shown?",
        options: [
          { key: "a", text: "![chip](images/q0003-chip.jpg)", explanation: "This photo shows the CPU." },
          { key: "b", text: "None of the above", explanation: "The photo does show a chip." },
        ],
        answer: ["a"],
        shuffle: false,
        quiz: "Sample quiz",
        addedAt: "2026-11-24",
      },
      {
        id: "q0004",
        type: "single",
        stem: "Interrupts are asynchronous.",
        options: [
          { key: "a", text: "True", explanation: "Devices raise them at any time." },
          { key: "b", text: "False", explanation: "They are not tied to the instruction stream." },
        ],
        answer: ["a"],
        shuffle: false,
        quiz: "Sample quiz",
        addedAt: "2026-11-24",
      },
      {
        id: "q0005",
        type: "written",
        points: 4,
        stem: "Explain polling versus interrupts.",
        modelAnswer: "Polling checks repeatedly; interrupts notify.",
        wordLimit: 100,
        quiz: "Sample quiz",
        addedAt: "2026-11-24",
      },
    ],
  };
}

test("a valid bank with every question type and images has no errors", () => {
  assert.deepEqual(validateBank(validBank(), { imageExists }), []);
});

test("an empty bank is valid", () => {
  assert.deepEqual(validateBank({ version: 1, nextId: 1, questions: [] }, { imageExists }), []);
});

const broken = [
  ["missing id", (b) => delete b.questions[0].id, /questions\[0\]\.id/],
  ["bad id pattern", (b) => (b.questions[0].id = "Q1"), /questions\[0\]\.id/],
  ["duplicate id", (b) => (b.questions[1].id = "q0001"), /questions\[1\]\.id.*duplicate/],
  ["nextId not greater than every id", (b) => (b.nextId = 5), /nextId/],
  ["unknown type", (b) => (b.questions[0].type = "essay"), /questions\[0\]\.type/],
  ["options on written", (b) => (b.questions[4].options = validBank().questions[0].options), /questions\[4\]\.options/],
  ["answer key not in options", (b) => (b.questions[0].answer = ["z"]), /questions\[0\]\.answer/],
  ["single with 2 answer keys", (b) => (b.questions[0].answer = ["a", "b"]), /questions\[0\]\.answer/],
  ["multi with 0 answer keys", (b) => (b.questions[1].answer = []), /questions\[1\]\.answer/],
  ["written without modelAnswer", (b) => delete b.questions[4].modelAnswer, /questions\[4\]\.modelAnswer/],
  ["option keys with a gap", (b) => (b.questions[0].options[2].key = "d"), /questions\[0\]\.options\[2\]\.key/],
  ["option without explanation", (b) => delete b.questions[0].options[1].explanation, /questions\[0\]\.options\[1\]\.explanation/],
  ["shuffle on written", (b) => (b.questions[4].shuffle = false), /questions\[4\]\.shuffle/],
  ["image path whose file is missing", (b) => (b.questions[0].stem += "\n\n![x](images/q0001-missing.png)"), /questions\[0\]\.stem.*images\/q0001-missing\.png/],
  ["image file name with a space", (b) => (b.questions[0].options[0].explanation = "![x](images/my chip.png)"), /questions\[0\]\.options\[0\]\.explanation.*space/],
  ["missing quiz", (b) => delete b.questions[0].quiz, /questions\[0\]\.quiz/],
  ["missing addedAt", (b) => delete b.questions[0].addedAt, /questions\[0\]\.addedAt/],
];

for (const [name, mutate, pattern] of broken) {
  test(`validateBank reports an error for: ${name}`, () => {
    const bank = validBank();
    mutate(bank);
    const errors = validateBank(bank, { imageExists });
    assert.ok(errors.length > 0, "expected at least one error");
    assert.ok(errors.some((e) => pattern.test(e)), `no error matches ${pattern}:\n${errors.join("\n")}`);
  });
}

const repo = fileURLToPath(new URL("..", import.meta.url));
const script = join(repo, "scripts", "validate-bank.mjs");

test("validate-bank script exits 0 on the committed bank", () => {
  const r = spawnSync(process.execPath, [script], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("validate-bank script checks real image files and exits 1 on errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "bank-"));
  mkdirSync(join(dir, "images"));
  writeFileSync(join(dir, "images", "q0002-diagram.png"), "");
  const bank = validBank();
  writeFileSync(join(dir, "bank.json"), JSON.stringify(bank));
  const r = spawnSync(process.execPath, [script, join(dir, "bank.json")], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /questions\[2\]\.options\[0\]\.text.*images\/q0003-chip\.jpg.*not found/);
  assert.doesNotMatch(r.stderr, /q0002-diagram/);

  writeFileSync(join(dir, "images", "q0003-chip.jpg"), "");
  const ok = spawnSync(process.execPath, [script, join(dir, "bank.json")], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test("validate-bank script exits 1 on a file that is not JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "bank-"));
  writeFileSync(join(dir, "bank.json"), "{ nope");
  const r = spawnSync(process.execPath, [script, join(dir, "bank.json")], { encoding: "utf8" });
  assert.equal(r.status, 1);
});
