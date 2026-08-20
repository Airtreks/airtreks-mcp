import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The ledger reads DATA_DIR at call time via store.ts, so point it at a temp dir
// before importing anything that touches it.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "spend-ledger-"));
process.env.UPSTREAM_DAILY_BUDGET = "5";

const { chargeSpend, peekSpend, _resetLedgerForTests } = await import("./spend-ledger.js");
const { writeJson } = await import("./store.js");

test("charges down to the budget and then refuses", () => {
  _resetLedgerForTests(0);
  for (let i = 1; i <= 5; i++) {
    assert.equal(chargeSpend(1).allowed, true, `search ${i} should be allowed`);
  }
  assert.equal(chargeSpend(1).allowed, false, "the 6th must be refused");
});

test("remaining reflects what is left", () => {
  _resetLedgerForTests(0);
  assert.equal(peekSpend().remaining, 5);
  chargeSpend(2);
  assert.equal(peekSpend().remaining, 3);
  assert.equal(peekSpend().spent, 2);
});

test("peek does not charge", () => {
  _resetLedgerForTests(0);
  peekSpend();
  peekSpend();
  assert.equal(peekSpend().spent, 0);
});

test("a multi-search call costs more than one unit", () => {
  // A multi-stop itinerary quote fans out into many provider searches, so it has
  // to draw proportionally on the budget or the ceiling means nothing.
  _resetLedgerForTests(0);
  chargeSpend(4);
  assert.equal(peekSpend().spent, 4);
  assert.equal(chargeSpend(1).allowed, true, "one unit left");
  assert.equal(chargeSpend(1).allowed, false);
});

test("a refused charge does not increase spend", () => {
  _resetLedgerForTests(5);
  chargeSpend(1);
  chargeSpend(1);
  assert.equal(peekSpend().spent, 5, "refusals must not accumulate");
});

test("the budget survives a process restart", async () => {
  // This is the whole reason it is on disk: an in-memory counter resets on every
  // deploy, and deploys are frequent enough to reset it several times a day.
  _resetLedgerForTests(0);
  chargeSpend(3);

  const reloaded = await import(`./spend-ledger.js?restart=${Date.now()}`);
  assert.equal(reloaded.peekSpend().spent, 3, "spend must persist across a fresh import");
});

test("yesterday's ledger does not eat today's budget", () => {
  writeJson("spend-ledger.json", { day: "2020-01-01", spent: 999999 });
  assert.equal(peekSpend().spent, 0, "a stale day starts fresh");
  assert.equal(peekSpend().allowed, true);
});

test("a zero budget disables the ceiling entirely", async () => {
  const previous = process.env.UPSTREAM_DAILY_BUDGET;
  process.env.UPSTREAM_DAILY_BUDGET = "0";
  try {
    const unlimited = await import(`./spend-ledger.js?nobudget=${Date.now()}`);
    for (let i = 0; i < 50; i++) {
      assert.equal(unlimited.chargeSpend(100).allowed, true);
    }
  } finally {
    process.env.UPSTREAM_DAILY_BUDGET = previous;
  }
});
