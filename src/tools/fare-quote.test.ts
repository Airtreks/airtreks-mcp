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
        perPassengerType: [{ type: "adult", count: 1, each: 492.37, total: 492.37 }],
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

  assert.equal(out.options![0].totalForParty, 492.37);
  assert.deepEqual(out.options![0].perTraveller, ["1 adult: 492 USD"]);
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
              { type: "adult", count: 2, each: 600, total: 1200 },
              { type: "child", count: 1, each: 300, total: 300 },
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
  // Must state the price each AND the party subtotal — the old "2 × adult:
  // 1,200 USD" was readable as either, and was reliably neither (AIR-808).
  assert.deepEqual(out.options![0].perTraveller, [
    "2 adults at 600 USD each = 1,200 USD",
    "1 child: 300 USD",
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

test("a party price is never presented as a per-person one, or vice versa (AIR-808)", async () => {
  // The bug: the upstream returns a per-passenger amount and its own total
  // ignores the counts, so a two-adult booking was shown as though the party
  // paid what one traveller pays. The output must now be unreadable as anything
  // but what it is.
  const out = await withBackend(
    backend(
      quote({
        options: [
          {
            total: 984.74, // 492.37 each x 2 — computed, not read from upstream
            currency: "USD",
            perPassengerType: [{ type: "adult", count: 2, each: 492.37, total: 984.74 }],
            legs: [{ flights: [{ from: "LAX", to: "NRT" }], stops: 0 }],
            baggage: null,
          },
        ],
      }),
    ),
    () => fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"], adults: 2 }),
  );

  const option = out.options![0];
  assert.equal(option.totalForParty, 984.74, "the party total must be each x count");
  assert.match(option.perTraveller[0], /each/, "the per-traveller line must say 'each'");
  assert.match(option.perTraveller[0], /492/, "and give the per-person figure");
  assert.match(option.perTraveller[0], /985/, "and the party subtotal");

  // No field named plainly "total" survives — that name was the ambiguity.
  assert.equal((option as any).total, undefined);
  assert.match(out.priced!, /totalForParty/, "the explainer must name the field");
});

test("the per-traveller line reads naturally for a single traveller", async () => {
  const out = await withBackend(backend(quote()), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );
  // "1 adult at 492 USD each = 492 USD" would be silly.
  assert.deepEqual(out.options![0].perTraveller, ["1 adult: 492 USD"]);
});

test("a multi-stop single-ticket quote points at itinerary_quote (AIR-808)", async () => {
  // A single fare across five legs is a valid answer and a commercially awful
  // one: measured 11,117 USD per person against 2,238 for the same trip split
  // across tickets. Returning the number without that context is how an agent
  // quotes four times the necessary price.
  const out = await withBackend(backend(quote()), () =>
    fareQuote({
      cities: ["OTP", "BKK", "SYD", "LAX", "LIS", "OTP"],
      dates: ["2027-01-14", "2027-01-18", "2027-01-26", "2027-02-02", "2027-02-16"],
    }),
  );

  assert.ok(out.alsoConsider, "a 5-leg single-ticket quote must flag the alternative");
  assert.match(out.alsoConsider!, /itinerary_quote/);
  assert.match(out.alsoConsider!, /ONE ticket/);
  assert.match(out.alsoConsider!, /5 flights/);
});

test("a simple one-leg quote is not cluttered with the hint", async () => {
  const out = await withBackend(backend(quote()), () =>
    fareQuote({ cities: ["LAX", "NRT"], dates: ["2026-11-12"] }),
  );
  assert.equal(out.alsoConsider, undefined, "a single flight has nothing to split");
});

test("overland legs do not trigger the hint on their own", async () => {
  const out = await withBackend(backend(quote()), () =>
    fareQuote({ cities: ["HAN", "000", "SGN", "SYD"], dates: ["2026-11-20"] }),
  );
  // Two flown legs after the overland marker is not a multi-stop trip.
  assert.equal(out.alsoConsider, undefined);
});
