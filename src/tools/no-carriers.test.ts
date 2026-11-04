import { test } from "node:test";
import assert from "node:assert/strict";
import { planRoute } from "./plan-route.js";
import { customRouteBuild } from "./custom-route-build.js";

// AIR-1311: the MCP gathers trip data and estimates; it does not choose airlines.
const CITIES = ["PDX", "LAX", "IAH", "MIA", "JFK", "ORD", "PDX"];

test("plan_route and custom_route_build name no airline or alliance", () => {
  for (const out of [planRoute({ cities: CITIES, budget: "business" }), customRouteBuild({ cities: CITIES, budget: "business" })]) {
    const text = JSON.stringify(out);
    assert.doesNotMatch(text, /"carrier"|alternatives|allianceFeasibility|allianceDetails|Alaska|oneworld|Star Alliance/);
  }
});

test("plan_route still describes the route", () => {
  const out = planRoute({ cities: CITIES }) as Record<string, any>;
  assert.equal(out.totalLegs, 6);
  assert.equal(out.isRoundTrip, true);
  assert.equal(out.customBuild.segments.length, 6);
});
