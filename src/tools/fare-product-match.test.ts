import { test } from "node:test";
import assert from "node:assert/strict";
import { fareProductMatch } from "./fare-product-match.js";

// AIR-1391: omitting isOneDirection used to mean "yes, one direction", so a Pacific out-and-back
// was called a classic round-the-world fare with high confidence.
const PACIFIC_OUT_AND_BACK = ["PDX", "LAX", "AKL", "DPS", "HKG", "PDX"];
const WESTBOUND_RTW = ["LAX", "NRT", "BKK", "DEL", "LHR", "JFK", "LAX"];

test("a route that is not one direction is not called a round-the-world fare", () => {
  const r = fareProductMatch({ cities: PACIFIC_OUT_AND_BACK });
  assert.ok(!r.recommendations.some((x) => x.code === "RTW"));
  assert.match(r.directionBasis, /worked out from the cities: mixed/);
});

test("a westbound round-the-world route is still matched to RTW without being told", () => {
  const r = fareProductMatch({ cities: WESTBOUND_RTW });
  assert.ok(r.recommendations.some((x) => x.code === "RTW"));
  assert.match(r.directionBasis, /westbound/);
});

test("what the caller states wins, and the basis says so", () => {
  const r = fareProductMatch({ cities: PACIFIC_OUT_AND_BACK, isOneDirection: true });
  assert.ok(r.recommendations.some((x) => x.code === "RTW"));
  assert.equal(r.directionBasis, "as you stated");
});
