import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../js/session.js";
import { createProgressStore } from "../js/progress.js";
import { pickNext } from "../js/select.js";

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const opt = (key) => ({ key, text: key.toUpperCase(), explanation: `About ${key}.` });
const base = { quiz: "Q", addedAt: "2026-11-24" };
const multi = { id: "q0001", type: "multi", points: 2, stem: "Pick", options: ["a", "b", "c", "d", "e"].map(opt), answer: ["b", "c", "e"], ...base };
const tf = { id: "q0002", type: "single", stem: "True?", options: [opt("a"), opt("b")], answer: ["a"], shuffle: false, ...base };
const fixed5 = { ...multi, id: "q0003", shuffle: false };
const written = { id: "q0004", type: "written", points: 10, stem: "Explain", modelAnswer: "Because.", ...base };

const NOW = "2026-11-24T10:00:00.000Z";

/** A pick that returns the given ids in turn and records what it was called with. */
function scriptedPick(order) {
  const calls = [];
  let i = 0;
  const pick = (ids, attempts, opts) => {
    calls.push({ ids: [...ids], recent: [...opts.recent] });
    return order[i++ % order.length];
  };
  return { pick, calls };
}

function session(questions, order, rng = mulberry32(1)) {
  const store = createProgressStore(memoryStorage());
  const { pick, calls } = scriptedPick(order);
  return { s: createSession({ questions, store, pick, now: () => NOW, rng }), store, calls };
}

test("submit on a multi question records the marked attempt; next(guessed) flags it and moves on", () => {
  const { s, store } = session([multi, tf], ["q0001", "q0002"]);
  assert.equal(s.current().state, "question");
  assert.equal(s.current().question.id, "q0001");
  assert.deepEqual(s.buttons(), ["submit"]);

  s.submit({ selected: ["b", "c", "a"] });
  const attempts = store.all();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].qid, "q0001");
  assert.ok(Math.abs(attempts[0].score - 0.4) < 1e-9);
  assert.equal(attempts[0].max, 2);
  assert.equal(attempts[0].outcome, "partial");
  assert.equal(attempts[0].guessed, false);
  assert.equal(attempts[0].at, NOW);
  assert.equal(s.current().state, "feedback");
  assert.equal(s.current().result.options.e, "correct-missed");
  assert.deepEqual(s.buttons(), ["next-guessed", "next"]);

  s.next({ guessed: true });
  assert.equal(store.all()[0].guessed, true);
  assert.equal(s.current().state, "question");
  assert.equal(s.current().question.id, "q0002");
});

test("next without guessed leaves guessed false", () => {
  const { s, store } = session([multi, tf], ["q0001", "q0002"]);
  s.submit({ selected: ["b"] });
  s.next();
  assert.equal(store.all()[0].guessed, false);
});

test("next before submit throws; submit twice throws", () => {
  const { s } = session([multi], ["q0001"]);
  assert.throws(() => s.next());
  s.submit({ selected: ["a"] });
  assert.throws(() => s.submit({ selected: ["a"] }));
});

test("submit with an empty response throws", () => {
  const a = session([multi], ["q0001"]).s;
  assert.throws(() => a.submit({ selected: [] }));
});

test("written: blank text is allowed (reveal the model answer without writing)", () => {
  const { s, store } = session([written], ["q0004"]);
  s.submit({ text: "" });
  assert.equal(s.current().state, "feedback");
  assert.deepEqual(store.all(), []);
});

test("options are shuffled per showing unless shuffle is false; responses store keys", () => {
  const keys = ["a", "b", "c", "d", "e"];
  const { s, store } = session([multi], ["q0001"], mulberry32(123));
  let differs = false;
  for (let i = 0; i < 20; i++) {
    const shown = s.current().shownOptions;
    assert.deepEqual([...shown].sort(), keys);
    if (shown.join() !== keys.join()) differs = true;
    s.submit({ selected: [shown[0]] });
    s.next();
  }
  assert.ok(differs);
  assert.ok(store.all().every((a) => a.response.selected.length === 1 && keys.includes(a.response.selected[0])));

  const fixed = session([fixed5], ["q0003"], mulberry32(5)).s;
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(fixed.current().shownOptions, keys);
    fixed.submit({ selected: ["a"] });
    fixed.next();
  }
});

test("written: submit records nothing; the self-mark buttons record the mark without the text", () => {
  const { s, store } = session([written], ["q0004"]);
  assert.deepEqual(s.current().shownOptions, []);
  s.submit({ text: "My answer" });
  assert.deepEqual(store.all(), []);
  assert.deepEqual(s.buttons(), ["next-right", "next-wrong", "next-partial"]);
  assert.throws(() => s.next());
  assert.throws(() => s.next({ guessed: true }));
  s.next({ mark: "right" });
  const [a] = store.all();
  assert.deepEqual(a, { qid: "q0004", at: NOW, score: null, max: 10, outcome: "right", guessed: false, response: {} });
  assert.equal(s.current().state, "question");
});

test("written: partial is recorded as guessed; wrong as wrong", () => {
  const { s, store } = session([written], ["q0004"]);
  s.submit({ text: "x" });
  s.next({ mark: "partial" });
  assert.equal(s.stats().guessed, 1);
  assert.deepEqual([store.all()[0].outcome, store.all()[0].guessed], ["partial", true]);
  s.submit({ text: "" });
  s.next({ mark: "wrong" });
  assert.equal(s.stats().wrong, 1);
  assert.equal(store.all()[1].guessed, false);
});

test("pick receives all bank ids and the shown ids, most recent last", () => {
  const { s, calls } = session([multi, tf, written], ["q0002", "q0004", "q0001", "q0002"]);
  for (let i = 0; i < 3; i++) {
    const q = s.current().question;
    s.submit(q.type === "written" ? { text: "x" } : { selected: ["a"] });
    s.next(q.type === "written" ? { mark: "right" } : {});
  }
  assert.deepEqual(calls.map((c) => c.ids), Array(4).fill(["q0001", "q0002", "q0004"]));
  assert.deepEqual(calls.map((c) => c.recent), [[], ["q0002"], ["q0002", "q0004"], ["q0002", "q0004", "q0001"]]);
});

test("works with the real pickNext and reports bank stats", () => {
  const store = createProgressStore(memoryStorage());
  const s = createSession({ questions: [multi, tf], store, pick: pickNext, now: () => NOW, rng: mulberry32(3) });
  assert.deepEqual(s.stats(), { total: 2, unseen: 2, wrong: 0, partial: 0, guessed: 0, right: 0, shown: 0 });
  const q = s.current().question;
  s.submit({ selected: q.answer });
  assert.equal(s.stats().right, 1);
});

test("next(guessed) after the store is replaced during feedback changes no attempt", () => {
  const { s, store } = session([multi, tf], ["q0001", "q0002"]);
  const backup = createProgressStore(memoryStorage());
  for (let i = 0; i < 3; i++) backup.record({ qid: "q0002", at: NOW, score: 0, max: 1, outcome: "wrong", guessed: false, response: { selected: ["b"] } });
  const exported = backup.exportJson(NOW);

  s.submit({ selected: ["b"] });
  store.importJson(exported);
  s.next({ guessed: true });
  assert.deepEqual(store.all().map((a) => a.guessed), [false, false, false]);

  s.submit({ selected: ["a"] });
  store.reset();
  assert.doesNotThrow(() => s.next({ guessed: true }));
  assert.deepEqual(store.all(), []);
});

test("restart shows a new question and drops the pending feedback", () => {
  const { s, store } = session([multi, tf], ["q0001", "q0002"]);
  s.submit({ selected: ["b"] });
  store.reset();
  s.restart();
  assert.equal(s.current().state, "question");
  assert.equal(s.current().question.id, "q0002");
  assert.throws(() => s.next({ guessed: true }));
  assert.deepEqual(store.all(), []);
});

test("an empty bank gives the empty state", () => {
  const s = createSession({ questions: [], store: createProgressStore(memoryStorage()), pick: pickNext, now: () => NOW, rng: Math.random });
  assert.equal(s.current().state, "empty");
  assert.deepEqual(s.buttons(), []);
});
