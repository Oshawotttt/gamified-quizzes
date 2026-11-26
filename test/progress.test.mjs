import { test } from "node:test";
import assert from "node:assert/strict";
import { createProgressStore, questionStatus, bankStats, progressKey, corruptKey, LEGACY_PROGRESS_KEY } from "../js/progress.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

function attempt(qid, outcome, extra = {}) {
  const score = outcome === "shown" ? null : outcome === "right" ? 2 : outcome === "partial" ? 1 : 0;
  return { qid, at: "2026-11-24T10:00:00.000Z", score, max: 2, outcome, guessed: false, response: { selected: ["a"] }, ...extra };
}

test("storage keys are per bank and prefixed for the shared github.io origin", () => {
  assert.equal(progressKey("a"), "gamified-quizzes.progress.v1.a");
  assert.equal(corruptKey("a"), "gamified-quizzes.progress.corrupt.a");
  assert.equal(LEGACY_PROGRESS_KEY, "gamified-quizzes.progress.v1");
});

test("stores for different banks on one storage keep separate attempts", () => {
  const storage = memoryStorage();
  const a = createProgressStore(storage, "a");
  const b = createProgressStore(storage, "b");
  a.record(attempt("q0001", "right"));
  b.record(attempt("q0002", "wrong"));
  assert.deepEqual(createProgressStore(storage, "a").all(), [attempt("q0001", "right")]);
  assert.deepEqual(createProgressStore(storage, "b").all(), [attempt("q0002", "wrong")]);
  assert.ok(storage.data.has("gamified-quizzes.progress.v1.a"));
  assert.ok(storage.data.has("gamified-quizzes.progress.v1.b"));
});

test("legacy progress moves to cs203 the first time its store is created", () => {
  const legacy = JSON.stringify({ version: 1, lastExportAt: null, attempts: [attempt("q0001", "right")] });
  const storage = memoryStorage({ "gamified-quizzes.progress.v1": legacy });
  assert.deepEqual(createProgressStore(storage, "other").all(), []);
  assert.equal(storage.getItem("gamified-quizzes.progress.v1"), legacy, "another bank must not touch the legacy key");
  assert.deepEqual(createProgressStore(storage, "cs203").all(), [attempt("q0001", "right")]);
  assert.equal(storage.getItem("gamified-quizzes.progress.v1"), null);
  assert.equal(storage.getItem("gamified-quizzes.progress.v1.cs203"), legacy);
  assert.deepEqual(createProgressStore(storage, "other").all(), []);
});

test("legacy progress is left alone when cs203 already has its own key", () => {
  const legacy = JSON.stringify({ version: 1, lastExportAt: null, attempts: [attempt("q0001", "right")] });
  const own = JSON.stringify({ version: 1, lastExportAt: null, attempts: [attempt("q0009", "wrong")] });
  const storage = memoryStorage({ "gamified-quizzes.progress.v1": legacy, "gamified-quizzes.progress.v1.cs203": own });
  assert.deepEqual(createProgressStore(storage, "cs203").all(), [attempt("q0009", "wrong")]);
  assert.equal(storage.getItem("gamified-quizzes.progress.v1"), legacy);
});

test("an export names its bank and is refused by a different bank", () => {
  const a = createProgressStore(memoryStorage(), "a");
  a.record(attempt("q0001", "right"));
  const text = a.exportJson("2026-11-24T12:00:00.000Z");
  assert.equal(JSON.parse(text).bank, "a");

  const b = createProgressStore(memoryStorage(), "b");
  b.record(attempt("q0005", "wrong"));
  const before = b.all();
  assert.throws(() => b.importJson(text), (e) => e.message.includes('"a"') && e.message.includes('"b"'));
  assert.deepEqual(b.all(), before);
});

test("an export with no bank field imports into whichever bank is open", () => {
  const text = JSON.stringify({ version: 1, lastExportAt: null, attempts: [attempt("q0001", "right")] });
  const b = createProgressStore(memoryStorage(), "b");
  b.importJson(text);
  assert.deepEqual(b.all(), [attempt("q0001", "right")]);
});

test("createProgressStore needs a bank id", () => {
  assert.throws(() => createProgressStore(memoryStorage()));
  assert.throws(() => createProgressStore(memoryStorage(), ""));
});

test("recorded attempts survive a new store on the same storage", () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, "a");
  assert.equal(store.record(attempt("q0001", "right")), 0);
  assert.equal(store.record(attempt("q0002", "wrong")), 1);
  const again = createProgressStore(storage, "a");
  assert.deepEqual(again.all(), [attempt("q0001", "right"), attempt("q0002", "wrong")]);
});

test("setGuessed persists", () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, "a");
  const i = store.record(attempt("q0001", "right"));
  store.setGuessed(i, true);
  assert.equal(createProgressStore(storage, "a").all()[i].guessed, true);
});

test("importJson rejects invalid JSON and wrong shapes, leaving attempts unchanged", () => {
  const store = createProgressStore(memoryStorage(), "a");
  store.record(attempt("q0001", "right"));
  const before = store.all();
  const bad = [
    "{ not json",
    "[]",
    JSON.stringify({ version: 2, lastExportAt: null, attempts: [] }),
    JSON.stringify({ version: 1, lastExportAt: null }),
    JSON.stringify({ version: 1, lastExportAt: null, attempts: [{ qid: "q0001" }] }),
    JSON.stringify({ version: 1, lastExportAt: null, attempts: [attempt("q0001", "maybe")] }),
  ];
  for (const text of bad) {
    assert.throws(() => store.importJson(text), Error, text);
    assert.deepEqual(store.all(), before);
  }
});

test("exportJson round-trips through importJson and sets lastExportAt", () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, "a");
  store.record(attempt("q0001", "right"));
  store.record(attempt("q0004", "shown", { response: { text: "my answer" } }));
  assert.equal(store.lastExportAt(), null);
  const text = store.exportJson("2026-11-24T12:00:00.000Z");
  assert.equal(store.lastExportAt(), "2026-11-24T12:00:00.000Z");
  assert.equal(createProgressStore(storage, "a").lastExportAt(), "2026-11-24T12:00:00.000Z");

  const other = createProgressStore(memoryStorage(), "a");
  other.importJson(text);
  assert.deepEqual(other.all(), store.all());
});

test("reset empties the store", () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, "a");
  store.record(attempt("q0001", "right"));
  store.reset();
  assert.deepEqual(store.all(), []);
  assert.deepEqual(createProgressStore(storage, "a").all(), []);
});

test("corrupt stored text gives an empty store and keeps the raw text", () => {
  for (const raw of ["{ broken", JSON.stringify({ version: 9, attempts: [] })]) {
    const storage = memoryStorage({ "gamified-quizzes.progress.v1.a": raw });
    const store = createProgressStore(storage, "a");
    assert.deepEqual(store.all(), []);
    assert.equal(storage.getItem("gamified-quizzes.progress.corrupt.a"), raw);
  }
});

test("questionStatus uses only the latest attempt", () => {
  const cases = [
    [[], "unseen"],
    [[attempt("q1", "right"), attempt("q1", "wrong")], "wrong"],
    [[attempt("q1", "wrong"), attempt("q1", "partial")], "partial"],
    [[attempt("q1", "wrong"), attempt("q1", "right", { guessed: true })], "guessed"],
    [[attempt("q1", "partial", { guessed: true })], "guessed"],
    [[attempt("q1", "wrong", { guessed: true })], "wrong"],
    [[attempt("q1", "wrong"), attempt("q1", "right")], "right"],
    [[attempt("q1", "shown")], "shown"],
    [[attempt("q2", "wrong")], "unseen"],
  ];
  for (const [attempts, status] of cases) {
    assert.equal(questionStatus("q1", attempts), status, JSON.stringify(attempts.map((a) => [a.qid, a.outcome, a.guessed])));
  }
});

test("bankStats counts statuses and ignores attempts for unknown qids", () => {
  const ids = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
  const attempts = [
    attempt("q1", "wrong"),
    attempt("q2", "partial"),
    attempt("q3", "right", { guessed: true }),
    attempt("q4", "wrong"),
    attempt("q4", "right"),
    attempt("q5", "shown"),
    attempt("gone", "wrong"),
    attempt("gone2", "right"),
  ];
  assert.deepEqual(bankStats(ids, attempts), { total: 7, unseen: 2, wrong: 1, partial: 1, guessed: 1, right: 1, shown: 1 });
});
