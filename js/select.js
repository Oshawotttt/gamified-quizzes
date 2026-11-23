// Question selection (I5). Tuning constants live here, in one place.
import { statusMap } from "./progress.js";

/** Banks with at least this many questions use pickBuckets; smaller ones use pickWeighted. */
export const LARGE_BANK = 100;

/**
 * Relative chance of one question being picked, by its status.
 * A question with weight 6 is 6x as likely as one with weight 1.
 * Used by pickWeighted for every question, and by pickBuckets inside the review bucket.
 */
export const WEIGHTS = { unseen: 3, wrong: 6, partial: 4, guessed: 4, right: 1, shown: 1 };

/**
 * Share of picks that come from each group, in pickBuckets only.
 * 0.5 = half of all questions shown come from review (wrong, partial, guessed),
 * whatever the size of each group. Re-normalised over the non-empty groups.
 */
export const BUCKETS = { review: 0.5, unseen: 0.35, known: 0.15 };

const WEIGHTED_RECENT = 3;
const BUCKETS_RECENT = 10;

/** questionIds minus the last `window` entries of recent; all of them if that leaves none. */
function candidates(questionIds, recent, window) {
  const excluded = new Set(recent.slice(-window));
  const kept = questionIds.filter((id) => !excluded.has(id));
  return kept.length ? kept : questionIds;
}

function weightedChoice(items, weightOf, rng) {
  const total = items.reduce((t, item) => t + weightOf(item), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

export function pickNext(questionIds, attempts, { recent = [], rng = Math.random } = {}) {
  if (questionIds.length === 0) return null;
  const pick = questionIds.length < LARGE_BANK ? pickWeighted : pickBuckets;
  return pick(questionIds, attempts, { recent, rng });
}

export function pickWeighted(questionIds, attempts, { recent = [], rng = Math.random } = {}) {
  if (questionIds.length === 0) return null;
  const status = statusMap(questionIds, attempts);
  return weightedChoice(candidates(questionIds, recent, WEIGHTED_RECENT), (id) => WEIGHTS[status.get(id)], rng);
}

const BUCKET_OF = { wrong: "review", partial: "review", guessed: "review", unseen: "unseen", right: "known", shown: "known" };

export function pickBuckets(questionIds, attempts, { recent = [], rng = Math.random } = {}) {
  if (questionIds.length === 0) return null;
  const status = statusMap(questionIds, attempts);
  const groups = { review: [], unseen: [], known: [] };
  for (const id of candidates(questionIds, recent, BUCKETS_RECENT)) groups[BUCKET_OF[status.get(id)]].push(id);

  const bucket = weightedChoice(
    Object.keys(BUCKETS).filter((b) => groups[b].length > 0),
    (b) => BUCKETS[b],
    rng,
  );
  const ids = groups[bucket];

  if (bucket === "review") return weightedChoice(ids, (id) => WEIGHTS[status.get(id)], rng);
  if (bucket === "unseen") return ids[Math.floor(rng() * ids.length)];

  // known: the question whose latest attempt is oldest (attempts are append-only,
  // so a lower index is older).
  const latestIndex = new Map();
  attempts.forEach((a, i) => latestIndex.set(a.qid, i));
  return ids.reduce((oldest, id) => (latestIndex.get(id) < latestIndex.get(oldest) ? id : oldest));
}
