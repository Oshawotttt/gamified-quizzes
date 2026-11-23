import { test } from "node:test";
import assert from "node:assert/strict";
import { markAnswer } from "../js/marking.js";

const opt = (key) => ({ key, text: key.toUpperCase(), explanation: `About ${key}.` });

const multi = {
  id: "q0001", type: "multi", points: 2, stem: "Pick",
  options: ["a", "b", "c", "d", "e"].map(opt), answer: ["b", "c", "e"],
  quiz: "Q", addedAt: "2026-11-24",
};

const single = {
  id: "q0002", type: "single", points: 2, stem: "Pick one",
  options: ["a", "b", "c", "d"].map(opt), answer: ["c"],
  quiz: "Q", addedAt: "2026-11-24",
};

const written = {
  id: "q0003", type: "written", points: 10, stem: "Explain", modelAnswer: "Because.",
  quiz: "Q", addedAt: "2026-11-24",
};

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("multi: per-option scheme gives the expected score and outcome", () => {
  const cases = [
    [["b", "c", "e"], 2, "right"],
    [["b", "c"], 1.2, "partial"],
    [["b", "c", "a"], 0.4, "partial"],
    [["a", "b", "c", "d", "e"], 0.4, "partial"],
    [["a", "d"], 0, "wrong"],
  ];
  for (const [selected, score, outcome] of cases) {
    const r = markAnswer(multi, { selected });
    close(r.score, score);
    assert.equal(r.max, 2);
    assert.equal(r.outcome, outcome, selected.join(","));
  }
});

test("multi: allOrNothing is max only for the exact answer set", () => {
  assert.equal(markAnswer(multi, { selected: ["e", "b", "c"] }).allOrNothing, 2);
  assert.equal(markAnswer(multi, { selected: ["a", "b", "c", "d", "e"] }).allOrNothing, 0);
  assert.equal(markAnswer(multi, { selected: ["b", "c"] }).allOrNothing, 0);
});

test("single: right key gives full points, any wrong key gives 0", () => {
  const right = markAnswer(single, { selected: ["c"] });
  close(right.score, 2);
  assert.equal(right.outcome, "right");
  for (const k of ["a", "b", "d"]) {
    const r = markAnswer(single, { selected: [k] });
    close(r.score, 0);
    assert.equal(r.outcome, "wrong");
  }
});

test("per-option states", () => {
  const r = markAnswer(multi, { selected: ["b", "c", "a"] });
  assert.deepEqual(r.options, {
    a: "wrong-ticked",
    b: "correct-ticked",
    c: "correct-ticked",
    d: "wrong-unticked",
    e: "correct-missed",
  });
});

test("points default to 1", () => {
  const { points, ...noPoints } = single;
  const r = markAnswer(noPoints, { selected: ["c"] });
  assert.equal(r.max, 1);
  close(r.score, 1);
});

test("written: no score, outcome shown", () => {
  assert.deepEqual(markAnswer(written, { text: "My answer" }), { score: null, max: 10, outcome: "shown" });
});
