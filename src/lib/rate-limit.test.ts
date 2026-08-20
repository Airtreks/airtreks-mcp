import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, peekRateLimit } from "./rate-limit.js";

// Buckets are module-level, so every test uses its own key.
let n = 0;
const key = () => `test-bucket-${++n}`;

test("allows exactly the limit, then refuses", () => {
  const k = key();
  for (let i = 1; i <= 3; i++) {
    assert.equal(checkRateLimit(k, 3).allowed, true, `request ${i} should be allowed`);
  }
  assert.equal(checkRateLimit(k, 3).allowed, false, "the 4th must be refused");
});

test("remaining counts down and floors at zero", () => {
  const k = key();
  assert.equal(checkRateLimit(k, 2).remaining, 1);
  assert.equal(checkRateLimit(k, 2).remaining, 0);
  assert.equal(checkRateLimit(k, 2).remaining, 0);
});

test("a refused request is not charged, so hammering cannot inflate the counter", () => {
  // The old behaviour incremented before checking, so a client that kept going
  // after its 429 drove the count arbitrarily past the limit and made it
  // useless as a record of what was actually served.
  const k = key();
  checkRateLimit(k, 1);
  for (let i = 0; i < 500; i++) checkRateLimit(k, 1);

  // Raising the limit must immediately free up room, which only holds if the
  // refused attempts were never counted.
  assert.equal(checkRateLimit(k, 2).allowed, true, "count should still be 1, not 501");
});

test("peek reports the same verdict without consuming", () => {
  const k = key();
  assert.equal(peekRateLimit(k, 1).allowed, true);
  assert.equal(peekRateLimit(k, 1).allowed, true, "peek must not consume");
  assert.equal(peekRateLimit(k, 1).remaining, 1);

  checkRateLimit(k, 1);
  assert.equal(peekRateLimit(k, 1).allowed, false);
  assert.equal(peekRateLimit(k, 1).remaining, 0);
});

test("peek on an untouched bucket reports it full", () => {
  const result = peekRateLimit(key(), 100);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 100);
  assert.ok(result.resetAt > Date.now(), "reset must be in the future");
});

test("buckets are independent", () => {
  const a = key();
  const b = key();
  checkRateLimit(a, 1);
  assert.equal(checkRateLimit(a, 1).allowed, false);
  assert.equal(checkRateLimit(b, 1).allowed, true, "one bucket must not affect another");
});

test("resetAt is the next UTC midnight", () => {
  const { resetAt } = checkRateLimit(key(), 1);
  const d = new Date(resetAt);
  assert.equal(d.getUTCHours(), 0);
  assert.equal(d.getUTCMinutes(), 0);
  assert.equal(d.getUTCSeconds(), 0);
});
