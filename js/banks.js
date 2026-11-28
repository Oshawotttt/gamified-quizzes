// Bank list for the picker screen (I-index). DOM-free so it can be tested in Node.
import { validateIndex } from "./bank.js";

export const INDEX_URL = "banks/index.json";

/** Folder of a bank: holds bank.json and images/. */
export const bankDir = (id) => `banks/${id}`;

/**
 * Load the bank list.
 * fetchJson(url): resolves to the parsed JSON, rejects on any failure.
 * Never rejects: a failed or invalid index gives no banks and an error message.
 */
export async function loadIndex(fetchJson) {
  let json;
  try {
    json = await fetchJson(INDEX_URL);
  } catch (err) {
    return { banks: [], error: `Could not load the bank list (${err.message}).` };
  }
  const errors = validateIndex(json);
  if (errors.length) return { banks: [], error: `The bank list is invalid: ${errors.join("; ")}` };
  return { banks: json.banks.map(({ id, name }) => ({ id, name })), error: null };
}

/** The listed bank named by `?bank=<id>` in a location.search string, or null. */
export function bankFromUrl(search, banks) {
  const id = new URLSearchParams(search).get("bank");
  if (!id) return null;
  return banks.find((b) => b.id === id) ?? null;
}
