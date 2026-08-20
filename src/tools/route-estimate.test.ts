import { test } from "node:test";
import assert from "node:assert/strict";
import { routeEstimate, routeEstimateSchema } from "./route-estimate.js";
import { setPricingBackend, type EstimateResult, type PricingBackend } from "../lib/pricing-backend.js";
import { TOOLS } from "./registry.js";

/** Values below are real production readings, so the tests exercise real shapes. */
function estimate(over: Partial<EstimateResult> = {}): EstimateResult {
  return {
    route: "LAX-NRT",
    cabin: "economy",
    currency: "USD",
    low: 377.22,
    high: 575.42,
    confidence: "high",
    premiumEconomyFallback: false,
    coverage: { priced: 1, total: 1 },
    ...over,
  };
}

function backendReturning(result: EstimateResult | Error, configured = true): PricingBackend {
  return {
    isConfigured: () => configured,
    estimateRoute: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    quoteFare: async () => {
      throw new Error("not used");
    },
  };
}

async function withBackend<T>(b: PricingBackend, run: () => Promise<T>): Promise<T> {
  setPricingBackend(b);
  try {
    return await run();
  } finally {
    setPricingBackend(null);
  }
}

test("returns a per-person range with its currency", async () => {
  const out = await withBackend(backendReturning(estimate()), () =>
    routeEstimate({ cities: ["LAX", "NRT"] }),
  );

  assert.deepEqual(out.estimate, { low: 377.22, high: 575.42 });
  assert.equal(out.currency, "USD");
  assert.equal(out.confidence, "high");
  assert.match(out.basis!, /377-575 USD per person/);
});

test("always says the range is history, never a live quote", async () => {
  const out = await withBackend(backendReturning(estimate()), () =>
    routeEstimate({ cities: ["LAX", "NRT"] }),
  );
  assert.ok(
    out.caveats!.some((c) => /not a live quote/i.test(c)),
    "every answer must say this is not a live quote",
  );
});

test("discloses a fabricated premium economy figure", async () => {
  // Real behaviour: the engine has no premium-economy history for BUF-TOS, so it
  // silently returns economy x 1.6 and reports success. 4 of 5 routes sampled in
  // production did this. A customer must not be told it is recorded data.
  const out = await withBackend(
    backendReturning(
      estimate({
        route: "BUF-TOS",
        cabin: "premium",
        low: 1846.01,
        high: 2815.95,
        confidence: "low",
        premiumEconomyFallback: true,
        coverage: { priced: 2, total: 3 },
      }),
    ),
    () => routeEstimate({ cities: ["BUF", "TOS"], cabin: "premium" }),
  );

  assert.ok(
    out.caveats!.some((c) => /no recorded premium economy fares/i.test(c)),
    `expected a premium-economy disclosure, got: ${JSON.stringify(out.caveats)}`,
  );
  assert.equal(out.confidence, "low");
  // The headline must not contradict the caveat by claiming fare history.
  assert.match(out.basis!, /estimated up from economy/i);
  assert.ok(!/from AirTreks fare history/i.test(out.basis!));
});

test("real premium economy data carries no fabrication caveat", async () => {
  const out = await withBackend(
    backendReturning(
      estimate({ cabin: "premium", low: 1503.44, high: 2293.39, confidence: "medium" }),
    ),
    () => routeEstimate({ cities: ["LAX", "NRT"], cabin: "premium" }),
  );

  assert.ok(!out.caveats!.some((c) => /estimated up from economy/i.test(c)));
});

test("flags partial coverage so a total is not read as complete", async () => {
  const out = await withBackend(
    backendReturning(estimate({ coverage: { priced: 2, total: 3 }, confidence: "medium" })),
    () => routeEstimate({ cities: ["BUF", "TOS"] }),
  );

  assert.ok(out.caveats!.some((c) => /no fare history/i.test(c)));
  assert.match(out.basis!, /not all of it/i);
});

test("a route with no history says so instead of inventing a range", async () => {
  const out = await withBackend(
    backendReturning(estimate({ low: null, high: null, confidence: "low", message: undefined })),
    () => routeEstimate({ cities: ["AAA", "BBB"] }),
  );

  assert.equal(out.estimate, undefined);
  assert.match(out.message!, /no recorded fares/i);
  assert.ok(out.planYourTrip);
});

test("an upstream failure surfaces its message, not a crash", async () => {
  const out = await withBackend(
    backendReturning(new Error("Not valid 3-letter airport codes: M. Use IATA codes, e.g. LAX, NRT.")),
    () => routeEstimate({ cities: ["JFK", "M"] }),
  );

  assert.match(out.error!, /Not valid 3-letter airport codes/);
  assert.ok(out.planYourTrip);
});

test("an unconfigured backend degrades instead of erroring", async () => {
  const out = await withBackend(backendReturning(estimate(), false), () =>
    routeEstimate({ cities: ["LAX", "NRT"] }),
  );

  assert.match(out.message!, /aren't available/i);
  assert.equal(out.estimate, undefined);
});

test("no response field exposes cost, margin or a raw count", async () => {
  const out = await withBackend(
    backendReturning(estimate({ coverage: { priced: 19, total: 21 } })),
    () => routeEstimate({ cities: ["LAX", "NRT", "BKK", "LHR", "LAX"] }),
  );

  const json = JSON.stringify(out);
  for (const key of ["cost", "margin", "taxes", "observations", "coverage", "fnf"]) {
    assert.ok(!json.includes(`"${key}"`), `${key} must not reach the caller`);
  }
});

test("route length is capped — this tool is free and unauthenticated", () => {
  const schema = routeEstimateSchema.cities;
  assert.equal(schema.safeParse(Array(14).fill("LAX")).success, true);
  assert.equal(schema.safeParse(Array(15).fill("LAX")).success, false);
  assert.equal(schema.safeParse(["LAX"]).success, false, "needs at least two places");
});

test("the tool is registered as free and read-only", () => {
  const tool = TOOLS.find((t) => t.name === "route_estimate");
  assert.ok(tool, "route_estimate must be in the registry");
  assert.equal(tool!.requiresKey, false);
  assert.equal(tool!.readOnly, true);
  // The description is what makes an agent pick this tool over guessing a price.
  assert.match(tool!.description, /range/i);
  assert.match(tool!.description, /not a live quote/i);
});
