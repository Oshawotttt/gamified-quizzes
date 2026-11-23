// Progress store (I4): an append-only list of attempts kept in localStorage,
// plus the per-question status and bank counts derived from it.

// Prefixed: every oshawotttt.github.io project site shares one origin and one localStorage.
export const PROGRESS_KEY = "gamified-quizzes.progress.v1";
export const CORRUPT_KEY = "gamified-quizzes.progress.corrupt";

export const OUTCOMES = ["right", "partial", "wrong", "shown"];
export const STATUSES = ["unseen", "wrong", "partial", "guessed", "right", "shown"];

const emptyState = () => ({ version: 1, lastExportAt: null, attempts: [] });

function attemptError(a, i) {
  const at = `attempts[${i}]`;
  if (!a || typeof a !== "object" || Array.isArray(a)) return `${at}: must be an object`;
  if (typeof a.qid !== "string" || a.qid === "") return `${at}.qid: must be a non-empty string`;
  if (typeof a.at !== "string" || Number.isNaN(Date.parse(a.at))) return `${at}.at: must be an ISO-8601 string`;
  if (!(a.score === null || (typeof a.score === "number" && Number.isFinite(a.score)))) return `${at}.score: must be a number or null`;
  if (!(typeof a.max === "number" && Number.isFinite(a.max))) return `${at}.max: must be a number`;
  if (!OUTCOMES.includes(a.outcome)) return `${at}.outcome: must be one of ${OUTCOMES.join(", ")}`;
  if (typeof a.guessed !== "boolean") return `${at}.guessed: must be a boolean`;
  if (!a.response || typeof a.response !== "object" || Array.isArray(a.response)) return `${at}.response: must be an object`;
  return null;
}

/** First problem with a progress object, or null when it has the I4 shape. */
export function progressError(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return "progress: must be an object";
  if (json.version !== 1) return `version: must be 1 (got ${JSON.stringify(json.version)})`;
  if (!(json.lastExportAt === null || typeof json.lastExportAt === "string")) return "lastExportAt: must be a string or null";
  if (!Array.isArray(json.attempts)) return "attempts: must be an array";
  for (let i = 0; i < json.attempts.length; i++) {
    const e = attemptError(json.attempts[i], i);
    if (e) return e;
  }
  return null;
}

function parseProgress(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${e.message}`);
  }
  const problem = progressError(json);
  if (problem) throw new Error(`Not a progress file: ${problem}`);
  return { version: 1, lastExportAt: json.lastExportAt, attempts: json.attempts };
}

/** storage: anything with getItem/setItem/removeItem (window.localStorage in the page). */
export function createProgressStore(storage) {
  let state = emptyState();
  const raw = storage.getItem(PROGRESS_KEY);
  if (raw !== null) {
    try {
      state = parseProgress(raw);
    } catch {
      // Keep the unreadable text so it can be recovered by hand; start empty.
      storage.setItem(CORRUPT_KEY, raw);
    }
  }

  const save = () => storage.setItem(PROGRESS_KEY, JSON.stringify(state));

  return {
    all: () => state.attempts.map((a) => ({ ...a })),
    record(attempt) {
      const e = attemptError(attempt, state.attempts.length);
      if (e) throw new Error(e);
      state.attempts.push({ ...attempt });
      save();
      return state.attempts.length - 1;
    },
    setGuessed(index, guessed) {
      if (!state.attempts[index]) throw new Error(`No attempt at index ${index}`);
      state.attempts[index].guessed = Boolean(guessed);
      save();
    },
    exportJson(now) {
      state.lastExportAt = now instanceof Date ? now.toISOString() : String(now);
      save();
      return JSON.stringify(state, null, 2);
    },
    lastExportAt: () => state.lastExportAt,
    importJson(text) {
      state = parseProgress(text);
      save();
    },
    reset() {
      state = emptyState();
      storage.removeItem(PROGRESS_KEY);
    },
  };
}

function statusOf(latest) {
  if (!latest) return "unseen";
  if (latest.guessed && latest.outcome !== "wrong") return "guessed";
  return latest.outcome;
}

function latestByQid(attempts) {
  const latest = new Map();
  for (const a of attempts) latest.set(a.qid, a); // append-only: later entries are newer
  return latest;
}

export function questionStatus(qid, attempts) {
  return statusOf(latestByQid(attempts).get(qid));
}

/** Status for every id in questionIds, as a Map. Attempts for other qids are ignored. */
export function statusMap(questionIds, attempts) {
  const latest = latestByQid(attempts);
  return new Map(questionIds.map((id) => [id, statusOf(latest.get(id))]));
}

export function bankStats(questionIds, attempts) {
  const stats = { total: questionIds.length, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) };
  for (const status of statusMap(questionIds, attempts).values()) stats[status]++;
  return stats;
}
