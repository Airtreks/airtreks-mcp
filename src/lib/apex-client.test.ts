import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTripIdeaPayload } from "./apex-client.js";

const OPTS = {
  firstName: "Test",
  lastName: "Traveler",
  email: "t@example.com",
  stops: ["BUH", "MAD", "RIO", "LAX", "AMS", "BUH"],
  dates: ["2027-03-02", "2027-03-06", "2027-03-20", "2027-03-29", "2027-04-04"],
};

test("citylist carries only intermediate stops — APEX adds startcity/endcity itself", () => {
  const payload = buildTripIdeaPayload(OPTS) as any;
  assert.equal(payload.startcity, "BUH");
  assert.equal(payload.endcity, "BUH");
  // No duplicated start/end: BUH-BUH segments made Amadeus reject pricing (error 925)
  assert.deepEqual(
    payload.citylist.map((c: any) => c.city),
    ["MAD", "RIO", "LAX", "AMS"]
  );
  // each intermediate stop keeps its own departure date
  assert.deepEqual(
    payload.citylist.map((c: any) => c.departure_date),
    ["2027-03-06", "2027-03-20", "2027-03-29", "2027-04-04"]
  );
  assert.equal(payload.start_date, "2027-03-02");
  assert.equal(payload.route, "BUH-MAD-RIO-LAX-AMS-BUH");
});

test("a 2-city trip has an empty citylist", () => {
  const payload = buildTripIdeaPayload({ ...OPTS, stops: ["SFO", "NRT"], dates: ["2026-11-10"] }) as any;
  assert.deepEqual(payload.citylist, []);
  assert.equal(payload.startcity, "SFO");
  assert.equal(payload.endcity, "NRT");
});
