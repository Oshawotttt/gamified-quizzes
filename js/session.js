// Quiz session: a DOM-free state machine for one-question-at-a-time practice.
// States: "question" -> submit(response) -> "feedback" -> next() -> "question" ...
// Written questions are self-marked: nothing is recorded at submit, and
// next({ mark }) records the mark. The written text is never stored.
// ("empty" when the bank has no questions.)
import { markAnswer } from "./marking.js";
import { bankStats } from "./progress.js";

function shuffled(keys, rng) {
  const out = [...keys];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Self-marks for written questions, passed as next({ mark }). */
export const SELF_MARKS = ["right", "partial", "wrong"];

const toIso = (t) => (t instanceof Date ? t.toISOString() : String(t));

/**
 * questions: bank questions (I1). store: progress store (I4).
 * pick(questionIds, attempts, { recent, rng }): next question id (I5 pickNext).
 * now(): current time (Date or ISO string). rng(): number in [0, 1).
 */
export function createSession({ questions, store, pick, now, rng }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ids = questions.map((q) => q.id);
  const recent = [];
  let view = { state: "empty" };

  function show() {
    if (ids.length === 0) {
      view = { state: "empty" };
      return;
    }
    const question = byId.get(pick(ids, store.all(), { recent: [...recent], rng }));
    recent.push(question.id);
    const keys = (question.options ?? []).map((o) => o.key);
    const shownOptions = question.shuffle === false ? keys : shuffled(keys, rng);
    view = { state: "question", question, shownOptions };
  }

  show();

  return {
    current: () => ({ ...view }),

    buttons() {
      if (view.state === "question") return ["submit"];
      if (view.state === "feedback") return view.question.type === "written" ? ["next-right", "next-wrong", "next-partial"] : ["next-guessed", "next"];
      return [];
    },

    submit(response) {
      if (view.state !== "question") throw new Error(`submit is not allowed in state ${view.state}`);
      const q = view.question;
      if (q.type === "written") {
        if (!response || typeof response.text !== "string") throw new Error("Written response needs a text string");
        // Not recorded here: the attempt is recorded by next({ mark }).
        const result = markAnswer(q, response);
        view = { ...view, state: "feedback", response, result, attemptIndex: null, attempt: null };
        return result;
      }
      if (!response || !Array.isArray(response.selected) || response.selected.length === 0) {
        throw new Error("Select at least one option");
      }
      const result = markAnswer(q, response);
      const attempt = {
        qid: q.id,
        at: toIso(now()),
        score: result.score,
        max: result.max,
        outcome: result.outcome,
        guessed: false,
        response,
      };
      const attemptIndex = store.record(attempt);
      view = { ...view, state: "feedback", response, result, attemptIndex, attempt: JSON.stringify(attempt) };
      return result;
    },

    next({ guessed = false, mark } = {}) {
      if (view.state !== "feedback") throw new Error(`next is not allowed in state ${view.state}`);
      if (view.question.type === "written") {
        if (!SELF_MARKS.includes(mark)) throw new Error(`mark must be one of ${SELF_MARKS.join(", ")}`);
        // "partial" is recorded as guessed so it shows and is reviewed as Guessed.
        // The written text is not stored (response is {}).
        store.record({ qid: view.question.id, at: toIso(now()), score: null, max: view.result.max, outcome: mark, guessed: mark === "partial", response: {} });
        show();
        return;
      }
      // Only flag the attempt this session recorded: an import or reset during
      // feedback replaces the store, and the index may now point elsewhere.
      const stored = store.all()[view.attemptIndex];
      const unchanged = stored && JSON.stringify({ ...stored, guessed: false }) === view.attempt;
      if (guessed && unchanged) store.setGuessed(view.attemptIndex, true);
      show();
    },

    /** Drop the current question or feedback and show a new question (after import or reset). */
    restart: () => show(),

    stats: () => bankStats(ids, store.all()),
  };
}
