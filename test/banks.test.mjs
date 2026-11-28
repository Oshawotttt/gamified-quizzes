import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadIndex, bankFromUrl, INDEX_URL } from "../js/banks.js";

const INDEX = { version: 1, banks: [{ id: "cs203", name: "CS203" }, { id: "os", name: "Operating Systems" }, { id: "db", name: "Databases" }] };

test("the index is fetched from banks/index.json", async () => {
  const urls = [];
  await loadIndex(async (url) => {
    urls.push(url);
    return INDEX;
  });
  assert.deepEqual(urls, ["banks/index.json"]);
  assert.equal(INDEX_URL, "banks/index.json");
});

test("loadIndex returns { id, name } entries in index order and no error", async () => {
  const r = await loadIndex(async () => INDEX);
  assert.deepEqual(r, {
    banks: [{ id: "cs203", name: "CS203" }, { id: "os", name: "Operating Systems" }, { id: "db", name: "Databases" }],
    error: null,
  });
});

test("loadIndex returns no banks and an error when the fetch fails", async () => {
  const r = await loadIndex(async () => {
    throw new Error("HTTP 404");
  });
  assert.deepEqual(r.banks, []);
  assert.match(r.error, /HTTP 404/);
});

test("loadIndex returns no banks and an error when the index is invalid", async () => {
  const r = await loadIndex(async () => ({ version: 1, banks: [{ id: "Bad Id", name: "X" }] }));
  assert.deepEqual(r.banks, []);
  assert.match(r.error, /banks\[0\]\.id/);
});

test("bankFromUrl returns the listed bank named by ?bank=", () => {
  assert.deepEqual(bankFromUrl("?bank=cs203", INDEX.banks), { id: "cs203", name: "CS203" });
  assert.deepEqual(bankFromUrl("?x=1&bank=os", INDEX.banks), { id: "os", name: "Operating Systems" });
});

test("bankFromUrl returns null with no bank, an empty bank or an unlisted bank", () => {
  for (const search of ["", "?bank=", "?bank=nope"]) {
    assert.equal(bankFromUrl(search, INDEX.banks), null, search);
  }
});

test("the Home Screen icon opens the picker: manifest start_url has no ?bank=", () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../manifest.webmanifest", import.meta.url)), "utf8"));
  assert.equal(manifest.start_url, "./");
});
