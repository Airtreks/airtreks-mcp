import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFlight } from "./links.js";

test("describeFlight names an operator only when it differs", () => {
  assert.equal(
    describeFlight({ from: "LAX", to: "ZRH", airline: "UA", flightNumber: "9729", operatedBy: "LX" }),
    "LAX→ZRH UA9729, operated by LX",
  );
  assert.equal(
    describeFlight({ from: "LAX", to: "NRT", airline: "NH", flightNumber: "175" }),
    "LAX→NRT NH175",
  );
});

test("describeFlight degrades rather than printing undefined", () => {
  // Upstream can omit the carrier; a leg with no airline should read as a leg,
  // not as "LAX→NRT undefinedundefined".
  assert.equal(describeFlight({ from: "LAX", to: "NRT" }), "LAX→NRT");
  assert.equal(
    describeFlight({ from: "LAX", to: "NRT", airline: "NH" }),
    "LAX→NRT NH",
    "a missing flight number must not print 'undefined'",
  );
});
