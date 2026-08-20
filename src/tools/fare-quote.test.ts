import { test } from "node:test";
import assert from "node:assert/strict";
import { fareQuote, fareQuoteSchema } from "./fare-quote.js";
import {
  setPricingBackend,
  type FareQuoteResult,
  type PricingBackend,
} from "../lib/pricing-backend.js";
import { TOOLS } from "./registry.js";

/** Shaped like a real /fares/quote response (LAX-NRT, 492.37 USD observed live). */
function quote(over: Partial<FareQuoteResult> = {}): FareQuoteResult {
  return {
    route: "LAX-NRT",
    cabin: "economy",
    currency: "USD",
    cached: false,
    options: [
      {
        total: 492.37,
        currency: "USD",
        perPassengerType: [{ type: "adult", count: 1, total: 492.37 }],
        legs: [
          {
            flights: [
              { from: "LAX", to: "NRT", airline: "NH", flightNumber: "175" },
            ],
            durationMinutes: 660,
            stops: 0,
          },
        ],
        baggage: "2 pieces",
      },
    ],
    ...over,
  };
}

function backend(result: FareQuoteResult | Error, configured = true): PricingBackend {
  return {
    isConfigured: () => configured,
    estimateRoute: async () => {
      throw new Error("not used");
    },
    quoteFare: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    startItineraryQuote: async () => {
      throw new Error("not used");
    },
    getItineraryQuote: async () => ({ status: "unknown" as const }),
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

test("returns a live total with a per-traveller breakdown", async () => {
  const out = await withBackend(backend(quote()), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );

  assert.equal(out.options![0].total, 492.37);
  assert.deepEqual(out.options![0].perTraveller, ["1 × adult: 492 USD"]);
  assert.equal(out.travellers, "1 adult");
  assert.equal(out.options![0].baggage, "2 pieces");
  assert.equal(out.options![0].durationHours, 11);
});

test("says a live fare can move, unlike an estimate", async () => {
  const out = await withBackend(backend(quote()), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );
  assert.ok(
    out.caveats!.some((c) => /can change/i.test(c)),
    "a live fare must be marked as changeable",
  );
});

test("discloses when a fare came from cache rather than a fresh search", async () => {
  const fresh = await withBackend(backend(quote({ cached: false })), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );
  const cached = await withBackend(backend(quote({ cached: true })), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );

  assert.ok(fresh.caveats!.some((c) => /just now/i.test(c)));
  assert.ok(cached.caveats!.some((c) => /last few minutes/i.test(c)));
});

test("describes a mixed party correctly", async () => {
  const out = await withBackend(
    backend(
      quote({
        options: [
          {
            total: 1500,
            currency: "USD",
            perPassengerType: [
              { type: "adult", count: 2, total: 1200 },
              { type: "child", count: 1, total: 300 },
            ],
            legs: [{ flights: [{ from: "LAX", to: "NRT" }], stops: 0 }],
            baggage: null,
          },
        ],
      }),
    ),
    () => fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"], adults: 2, children: 1 }),
  );

  assert.equal(out.travellers, "2 adults, 1 child");
  assert.deepEqual(out.options![0].perTraveller, [
    "2 × adult: 1,200 USD",
    "1 × child: 300 USD",
  ]);
});

test("an unpriceable itinerary explains why, and points at a consultant", async () => {
  const out = await withBackend(backend(quote({ options: [], message: undefined })), () =>
    fareQuote({ cities: ["LAX", "NRT", "BKK", "LHR", "GRU", "SYD"], dates: Array(5).fill("2026-11-12") }),
  );

  assert.equal(out.options, undefined);
  assert.match(out.message!, /single fare|separate tickets/i);
  assert.ok(out.planYourTrip);
});

test("a date/leg mismatch surfaces the upstream message, not a crash", async () => {
  const out = await withBackend(
    backend(new Error("This route has 2 flights, so it needs 2 departure dates (got 1).")),
    () => fareQuote({ cities: ["LAX", "NRT", "BKK"], dates: ["2026-11-12"] }),
  );

  assert.match(out.error!, /needs 2 departure dates/);
  // A failed live quote must not be a dead end for the agent.
  assert.match(out.tryInstead!, /route_estimate/);
});

test("an unconfigured backend degrades instead of erroring", async () => {
  const out = await withBackend(backend(quote(), false), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );

  assert.match(out.message!, /isn't available/i);
  assert.equal(out.options, undefined);
});

test("no response field exposes cost or margin", async () => {
  const out = await withBackend(backend(quote()), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );

  const json = JSON.stringify(out);
  for (const key of ["cost", "margin", "taxes", "base", "raw_response"]) {
    assert.ok(!json.includes(`"${key}"`), `${key} must not reach the caller`);
  }
});

test("route length is capped tighter than route_estimate — every call spends a GDS search", () => {
  assert.equal(fareQuoteSchema.cities.safeParse(Array(10).fill("LAX")).success, true);
  assert.equal(fareQuoteSchema.cities.safeParse(Array(11).fill("LAX")).success, false);
});

test("passenger counts are bounded and dates are required", () => {
  assert.equal(fareQuoteSchema.adults.safeParse(10).success, false);
  assert.equal(fareQuoteSchema.adults.safeParse(0).success, false);
  assert.equal(fareQuoteSchema.infants.safeParse(0).success, true);
  assert.equal(fareQuoteSchema.dates.safeParse([]).success, false, "at least one date");
  assert.equal(fareQuoteSchema.maxOptions.safeParse(11).success, false);
});

test("the tool is registered read-only, and its description separates it from route_estimate", () => {
  const tool = TOOLS.find((t) => t.name === "fare_quote");
  assert.ok(tool, "fare_quote must be in the registry");
  assert.equal(tool!.readOnly, true);
  // An agent has to be able to tell these two apart, or it will call the wrong one.
  assert.match(tool!.description, /live/i);
  assert.match(tool!.description, /route_estimate/);
});
