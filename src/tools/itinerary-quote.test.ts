import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itineraryQuote,
  itineraryQuoteStatus,
  itineraryQuoteSchema,
  itineraryQuoteStatusSchema,
  estimateSearches,
} from "./itinerary-quote.js";
import { setPricingBackend, type PricingBackend, type QuoteJobState } from "../lib/pricing-backend.js";
import { TOOLS, upstreamCostOf } from "./registry.js";

/** Shaped like the live LAX-NRT-BKK-LHR-LAX result. */
const READY: QuoteJobState = {
  status: "ready",
  route: "LAX-NRT-BKK-LHR-LAX",
  cabin: "economy",
  currency: "USD",
  unpriced: [],
  options: [
    {
      bestFor: "lowest total price",
      total: 1514.52,
      currency: "USD",
      perPassengerType: [{ type: "adult", count: 1, total: 1514.52 }],
      tickets: [
        { covers: "LAX → NRT", total: 492.37, legs: [{ flights: [{ from: "LAX", to: "NRT", airline: "NH", flightNumber: "175" }], stops: 0 }], baggage: "2 pieces" },
        { covers: "NRT → BKK", total: 511.15, legs: [{ flights: [{ from: "NRT", to: "BKK" }], stops: 0 }], baggage: null },
        { covers: "BKK → LHR → LAX", total: 511.0, legs: [{ flights: [{ from: "BKK", to: "LHR" }], stops: 0 }], baggage: null },
      ],
      durationMinutes: 2220,
      stops: 3,
    },
    {
      bestFor: "fewest stops",
      total: 5964.22,
      currency: "USD",
      perPassengerType: [{ type: "adult", count: 1, total: 5964.22 }],
      tickets: [{ covers: "LAX → NRT → BKK → LHR → LAX", total: 5964.22, legs: [], baggage: "2 pieces" }],
      stops: 0,
    },
  ],
};

function backend(over: Partial<PricingBackend> = {}, configured = true): PricingBackend {
  return {
    isConfigured: () => configured,
    estimateRoute: async () => { throw new Error("not used"); },
    quoteFare: async () => { throw new Error("not used"); },
    startItineraryQuote: async () => ({ handle: "x".repeat(43), retryAfterSeconds: 8 }),
    getItineraryQuote: async () => READY,
    ...over,
  };
}

async function withBackend<T>(b: PricingBackend, run: () => Promise<T>): Promise<T> {
  setPricingBackend(b);
  try { return await run(); } finally { setPricingBackend(null); }
}

const TRIP = { cities: ["LAX", "NRT", "BKK", "LHR", "LAX"], dates: ["2026-11-12", "2026-11-20", "2026-11-28", "2026-12-06"] };

test("starting a quote returns a reference and says to keep it", async () => {
  const out: any = await withBackend(backend(), () => itineraryQuote(TRIP));

  assert.equal(out.status, "pending");
  assert.equal(out.quoteReference.length, 43);
  // An agent that loses the reference cannot get the answer back — there is no
  // lookup by question, deliberately. So the instruction has to be explicit.
  assert.match(out.nextStep, /keep that reference/i);
  assert.match(out.nextStep, /itinerary_quote_status/);
  assert.ok(out.nextStep.includes(out.quoteReference), "the reference must appear in the instruction");
});

test("a pending status tells the agent to poll, not to restart", async () => {
  const out: any = await withBackend(
    backend({ getItineraryQuote: async () => ({ status: "pending", retryAfterSeconds: 18 }) }),
    () => itineraryQuoteStatus({ quoteReference: "y".repeat(43) }),
  );

  assert.equal(out.status, "pending");
  assert.equal(out.retryAfterSeconds, 18);
  assert.match(out.nextStep, /same quoteReference/i);
});

test("a ready quote presents each way of ticketing the trip", async () => {
  const out: any = await withBackend(backend(), () =>
    itineraryQuoteStatus({ quoteReference: "z".repeat(43) }),
  );

  assert.equal(out.status, "ready");
  assert.equal(out.options.length, 2);
  assert.equal(out.options[0].bestFor, "lowest total price");
  assert.equal(out.options[0].ticketCount, 3);
  assert.equal(out.options[1].ticketCount, 1);
  assert.deepEqual(out.options[0].perTraveller, ["1 × adult: 1,515 USD"]);
  assert.equal(out.options[0].durationHours, 37);
});

test("it warns that separate tickets do not protect each other", async () => {
  // The cheap option is cheap because it is several independent tickets. A
  // customer choosing on price alone should know what they are giving up.
  const out: any = await withBackend(backend(), () =>
    itineraryQuoteStatus({ quoteReference: "z".repeat(43) }),
  );
  assert.ok(out.caveats.some((c: string) => /separate tickets/i.test(c)));
  assert.ok(out.caveats.some((c: string) => /can change/i.test(c)));
});

test("an unknown or expired reference does not dead-end the agent", async () => {
  for (const status of ["unknown", "failed"] as const) {
    const out: any = await withBackend(
      backend({ getItineraryQuote: async () => ({ status, message: "nope" }) }),
      () => itineraryQuoteStatus({ quoteReference: "q".repeat(43) }),
    );
    assert.equal(out.status, status);
    assert.match(out.tryInstead, /route_estimate/);
  }
});

test("an unpriceable trip says so and surfaces which segments failed", async () => {
  const out: any = await withBackend(
    backend({
      getItineraryQuote: async () => ({
        status: "ready", route: "AAA-BBB", currency: "USD", options: [], unpriced: ["AAA-BBB"],
      }),
    }),
    () => itineraryQuoteStatus({ quoteReference: "r".repeat(43) }),
  );

  assert.equal(out.options, undefined);
  assert.match(out.message, /couldn't price|consultant/i);
  assert.deepEqual(out.unpricedSegments, ["AAA-BBB"]);
});

test("a queue-full refusal points somewhere useful", async () => {
  const out: any = await withBackend(
    backend({ startItineraryQuote: async () => { throw new Error("Too many itinerary quotes are running right now."); } }),
    () => itineraryQuote(TRIP),
  );
  assert.match(out.error, /Too many/);
  assert.match(out.tryInstead, /route_estimate/);
});

test("an unconfigured backend degrades instead of erroring", async () => {
  const out: any = await withBackend(backend({}, false), () => itineraryQuote(TRIP));
  assert.match(out.message, /isn't available/i);
  assert.equal(out.quoteReference, undefined);
});

test("cost scales with the trip, so the priciest tool draws the most budget", () => {
  // Upstream generates ~4N-5 searches with no hub splits and up to 12N-17 with
  // one per leg; cross-region legs get them, which is most of what this is for.
  assert.equal(estimateSearches({ cities: ["LAX", "NRT"] }), 3);
  assert.equal(estimateSearches({ cities: ["LAX", "NRT", "BKK", "LHR"] }), 19);
  assert.equal(estimateSearches({ cities: ["LAX", "NRT", "BKK", "LHR", "LAX"] }), 31);
  // Overland markers are not flown, so they must not inflate the charge.
  assert.equal(
    estimateSearches({ cities: ["LAX", "NRT", "000", "BKK"] }),
    estimateSearches({ cities: ["LAX", "NRT", "BKK"] }),
  );
  assert.ok(estimateSearches({ cities: [] }) >= 1, "never free");
});

test("the registry charges the per-call cost, not a flat one", () => {
  const tool = TOOLS.find((t) => t.name === "itinerary_quote")!;
  const small = upstreamCostOf(tool, { cities: ["LAX", "NRT"] });
  const large = upstreamCostOf(tool, { cities: ["LAX", "NRT", "BKK", "LHR", "LAX"] });
  assert.ok(large > small * 5, `a 4-leg trip must cost far more than a 1-leg one (${small} vs ${large})`);
});

test("polling is free, so an agent is never punished for waiting", () => {
  const status = TOOLS.find((t) => t.name === "itinerary_quote_status")!;
  assert.ok(!status.upstreamCost, "reading a finished job does no searching");
});

test("schemas bound the trip and require a plausible reference", () => {
  assert.equal(itineraryQuoteSchema.cities.safeParse(Array(12).fill("LAX")).success, true);
  assert.equal(itineraryQuoteSchema.cities.safeParse(Array(13).fill("LAX")).success, false);
  assert.equal(itineraryQuoteSchema.dates.safeParse([]).success, false);
  assert.equal(itineraryQuoteStatusSchema.quoteReference.safeParse("short").success, false);
  assert.equal(itineraryQuoteStatusSchema.quoteReference.safeParse("x".repeat(43)).success, true);
});
