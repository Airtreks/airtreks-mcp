import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "store-test-"));
process.env.DATA_DIR = dir;
process.env.UPSTREAM_DAILY_BUDGET = "5";
const { readJson, readJsonState, writeJson } = await import("./store.js");
const { safeEqual } = await import("./secure.js");

test("writeJson leaves no temp file and round-trips", () => {
  writeJson("a.json", { x: 1 });
  assert.deepEqual(readJson("a.json", null), { x: 1 });
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("a missing file reads as missing; a corrupt one is moved aside, not lost", () => {
  assert.equal(readJsonState("nope.json").status, "missing");
  writeFileSync(join(dir, "k.json"), '{"keys": [{"key": "at_1"');
  assert.equal(readJsonState("k.json").status, "corrupt");
  assert.ok(!existsSync(join(dir, "k.json")));
  assert.ok(readdirSync(dir).some((f) => f.startsWith("k.json.corrupt-")), "the bad file is kept for recovery");
});

test("a corrupt spend ledger fails closed instead of resetting to zero", async () => {
  const { chargeSpend } = await import("./spend-ledger.js");
  writeFileSync(join(dir, "spend-ledger.json"), "{not json");
  assert.equal(chargeSpend(1).allowed, false);
});

test("safeEqual compares correctly", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "secreT"), false);
  assert.equal(safeEqual("secret", "a-much-longer-value"), false);
});
