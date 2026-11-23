// Marking (I3).
// single/multi: each option is one choice. Ticking a correct option or leaving
// a wrong option unticked is a correct choice; anything else is a wrong choice.
//   score = max(0, (correctChoices - wrongChoices) / numOptions * points)
// written: no score; the model answer is shown (outcome "shown").

const EPSILON = 1e-9;

/** Points for a question (default 1). */
export function questionPoints(question) {
  return question.points ?? 1;
}

export function markAnswer(question, response) {
  const max = questionPoints(question);
  if (question.type === "written") return { score: null, max, outcome: "shown" };

  const answer = new Set(question.answer);
  const selected = new Set(response.selected);
  const options = {};
  let correctChoices = 0;

  for (const { key } of question.options) {
    const correct = answer.has(key);
    const ticked = selected.has(key);
    if (correct === ticked) correctChoices++;
    options[key] = `${correct ? "correct" : "wrong"}-${ticked ? "ticked" : correct ? "missed" : "unticked"}`;
  }

  const numOptions = question.options.length;
  const wrongChoices = numOptions - correctChoices;
  const score = Math.max(0, ((correctChoices - wrongChoices) / numOptions) * max);
  const exact = selected.size === answer.size && [...answer].every((k) => selected.has(k));
  const outcome = Math.abs(score - max) < EPSILON ? "right" : score < EPSILON ? "wrong" : "partial";

  return { score, max, allOrNothing: exact ? max : 0, outcome, options };
}
