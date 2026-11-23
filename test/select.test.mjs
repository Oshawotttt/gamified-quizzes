import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext, pickWeighted, pickBuckets, LARGE_BANK, WEIGHTS, BUCKETS } from "../js/select.js";
import { statusMap } from "../js/progress.js";

// Deterministic PRNG for repeatable tests.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (n, prefix = "q") => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, "0")}`);

let clock = 0;
function attemptFor(qid, status) {
  const at = new Date(Date.UTC(2026, 10, 1) + clock++ * 60000).toISOString();
  const outcome = status === "guessed" ? "right" : status;
  return { qid, at, score: outcome === "shown" ? null : 0, max: 1, outcome, guessed: status === "guessed", response: {} };
}

/** Attempts that give each id the status listed for it (statuses cycle over the ids). */
function attemptsWithStatuses(questionIds, statuses) {
  const attempts = [];
  questionIds.forEach((id, i) => {
    const s = statuses[i % statuses.length];
    if (s !== "unseen") attempts.push(attemptFor(id, s));
  });
  return attempts;
}

test("constants match the spec", () => {
  assert.equal(LARGE_BANK, 100);
  assert.deepEqual(WEIGHTS, { unseen: 3, wrong: 6, partial: 4, guessed: 4, right: 1, shown: 1 });
  assert.deepEqual(BUCKETS, { review: 0.5, unseen: 0.35, known: 0.15 });
});

test("empty bank gives null; a one-question bank returns it even if recent", () => {
  assert.equal(pickNext([], [], { recent: [], rng: mulberry32(1) }), null);
  assert.equal(pickNext(["q0001"], [], { recent: ["q0001"], rng: mulberry32(1) }), "q0001");
});

test("99 ids use the 3-question recent window, 100 ids the 10-question window", () => {
  const rng = mulberry32(7);
  const large = ids(100);
  const recentLarge = large.slice(0, 10);
  for (let i = 0; i < 1000; i++) {
    assert.ok(!recentLarge.includes(pickNext(large, [], { recent: recentLarge, rng })));
  }

  const small = ids(99);
  const recentSmall = small.slice(0, 10);
  const fourthFromLast = recentSmall.at(-4);
  const picks = new Set();
  for (let i = 0; i < 1000; i++) picks.add(pickNext(small, [], { recent: recentSmall, rng }));
  assert.ok(picks.has(fourthFromLast));
  for (const id of recentSmall.slice(-3)) assert.ok(!picks.has(id));
});

test("pickWeighted: frequency per status follows WEIGHTS and the last 3 recent are never returned", () => {
  const statuses = ["unseen", "wrong", "partial", "guessed", "right", "shown"];
  const qids = ids(60);
  const attempts = attemptsWithStatuses(qids, statuses);
  const status = statusMap(qids, attempts);
  const rng = mulberry32(42);
  const N = 10000;

  // Share per status from WEIGHTS: 10 questions per status, so weight share = w / sum(w).
  const sum = statuses.reduce((t, s) => t + WEIGHTS[s], 0);
  const counts = Object.fromEntries(statuses.map((s) => [s, 0]));
  for (let i = 0; i < N; i++) counts[status.get(pickWeighted(qids, attempts, { recent: [], rng }))]++;
  for (const s of statuses) {
    const expected = WEIGHTS[s] / sum;
    assert.ok(Math.abs(counts[s] / N - expected) <= 0.02, `${s}: ${counts[s] / N} vs ${expected}`);
  }

  const recent = qids.slice(10, 20);
  const banned = recent.slice(-3);
  for (let i = 0; i < N; i++) assert.ok(!banned.includes(pickWeighted(qids, attempts, { recent, rng })));
});

const bucketOf = (s) => (s === "unseen" ? "unseen" : s === "right" || s === "shown" ? "known" : "review");

function bucketFrequencies(qids, attempts, seed) {
  const status = statusMap(qids, attempts);
  const rng = mulberry32(seed);
  const N = 10000;
  const counts = { review: 0, unseen: 0, known: 0 };
  for (let i = 0; i < N; i++) counts[bucketOf(status.get(pickBuckets(qids, attempts, { recent: [], rng })))]++;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / N]));
}

test("pickBuckets: bucket frequencies follow BUCKETS, re-normalised when a bucket is empty", () => {
  const qids = ids(200);
  // Uneven bucket sizes on purpose: shares must not depend on them.
  const all = bucketFrequencies(qids, attemptsWithStatuses(qids, ["unseen", "wrong", "right", "right", "partial", "guessed", "shown", "right"]), 3);
  for (const b of ["review", "unseen", "known"]) {
    assert.ok(Math.abs(all[b] - BUCKETS[b]) <= 0.02, `${b}: ${all[b]} vs ${BUCKETS[b]}`);
  }

  const noUnseen = bucketFrequencies(qids, attemptsWithStatuses(qids, ["wrong", "right", "partial", "shown"]), 5);
  const total = BUCKETS.review + BUCKETS.known;
  assert.equal(noUnseen.unseen, 0);
  assert.ok(Math.abs(noUnseen.review - BUCKETS.review / total) <= 0.02, `review: ${noUnseen.review}`);
  assert.ok(Math.abs(noUnseen.known - BUCKETS.known / total) <= 0.02, `known: ${noUnseen.known}`);
});

test("pickBuckets: the known pick is the question with the oldest latest attempt", () => {
  const qids = ids(120);
  // Every question answered right twice, in an order where q0050's latest attempt is oldest.
  const order = [...qids.slice(49), ...qids.slice(0, 49)];
  const attempts = [...qids.map((q) => attemptFor(q, "right")), ...order.map((q) => attemptFor(q, "right"))];
  assert.equal(pickBuckets(qids, attempts, { recent: [], rng: mulberry32(9) }), "q0050");
});

test("when every candidate is in recent, a question is still returned", () => {
  const rng = mulberry32(11);
  for (let n = 1; n <= 3; n++) {
    const qids = ids(n);
    assert.ok(qids.includes(pickWeighted(qids, [], { recent: qids, rng })), `pickWeighted n=${n}`);
    assert.ok(qids.includes(pickNext(qids, [], { recent: qids, rng })), `pickNext n=${n}`);
  }
  for (const n of [1, 5, 10]) {
    const qids = ids(n);
    assert.ok(qids.includes(pickBuckets(qids, [], { recent: qids, rng })), `pickBuckets n=${n}`);
  }
});
