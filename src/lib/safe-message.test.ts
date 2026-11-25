import { test } from "node:test";
import assert from "node:assert/strict";
import { customerSafeMessage, assumedDefaults, NO_FARE_MESSAGE } from "./safe-message.js";

// AIR-1391: a raw supplier line reached an agent as "Amadeus error 866: NO FARE FOUND ...".
test("a raw supplier error becomes plain words with a next step", () => {
  for (const raw of ["Amadeus error 866: NO FARE FOUND FOR REQUESTED ITINERARY", "GDS timeout", "error 301 NEED PRICING"]) {
    assert.equal(customerSafeMessage(raw, "fallback"), NO_FARE_MESSAGE, raw);
  }
  assert.match(NO_FARE_MESSAGE, /route_estimate/);
  assert.match(NO_FARE_MESSAGE, /Submit this trip so we can build a solution that does price with availability/);
  assert.match(NO_FARE_MESSAGE, /trip_idea_create/);
});

test("an ordinary message is kept, and an empty one gets the fallback", () => {
  assert.equal(customerSafeMessage("This route has 5 flights, so it needs 5 dates.", "fallback"), "This route has 5 flights, so it needs 5 dates.");
  assert.equal(customerSafeMessage(undefined, "fallback"), "fallback");
  assert.equal(customerSafeMessage("  ", "fallback"), "fallback");
});

test("the assumed cabin and party size are named, and nothing is said when both were given", () => {
  assert.match(assumedDefaults({}, true)!, /economy cabin/);
  assert.match(assumedDefaults({}, true)!, /1 adult/);
  assert.doesNotMatch(assumedDefaults({}, false)!, /adult/);
  assert.equal(assumedDefaults({ cabin: "business", adults: 2 }, true), undefined);
  assert.equal(assumedDefaults({ cabin: "business" }, false), undefined);
});
