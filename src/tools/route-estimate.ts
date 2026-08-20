import { z } from "zod";
import { TRIP_PLANNER_URL } from "../lib/links.js";
import {
  forwardPricingRequest,
  getPricingBackend,
  type Cabin,
  type EstimateResult,
} from "../lib/pricing-backend.js";

/**
 * Upper bound on route length. Each place adds priced units the backend has to
 * look up, and this tool is free and unauthenticated, so an unbounded list is
 * an easy way to make one call cost a lot of work upstream.
 */
const MAX_PLACES = 14;

export const routeEstimateSchema = {
  cities: z
    .array(z.string())
    .min(2)
    .max(MAX_PLACES)
    .describe(
      "Ordered list of IATA city/airport codes for the whole trip, e.g. ['LAX','NRT','BKK','LHR','LAX']. " +
        "Put '000' between two codes to mark that leg as travelled overland rather than flown, e.g. ['HAN','000','SGN','SYD'].",
    ),
  cabin: z
    .enum(["economy", "premium", "business", "first"])
    .optional()
    .describe("Cabin to price. Defaults to economy. 'premium' means premium economy."),
};

export interface RouteEstimateResult {
  route: string;
  cabin: Cabin;
  currency?: string;
  estimate?: { low: number; high: number };
  confidence?: string;
  basis?: string;
  caveats?: string[];
  planYourTrip?: string;
  message?: string;
  error?: string;
}

/** "1,332" — grouped, no decimals. These are ranges, not invoices. */
function money(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function describeConfidence(result: EstimateResult): string {
  const { priced, total } = result.coverage;
  const partial = total > 0 && priced < total;
  switch (result.confidence) {
    case "high":
      return "We have priced this route many times before.";
    case "medium":
      return partial
        ? "We have history for most of this route, but not all of it."
        : "We have some history for this route, though not a lot.";
    default:
      return partial
        ? "We have history for only part of this route, so treat this as a rough starting point."
        : "We have very little history for this route, so treat this as a rough starting point.";
  }
}

function buildCaveats(result: EstimateResult): string[] {
  const caveats: string[] = [
    "This is a range from past AirTreks bookings, not a live quote — it does not reflect today's availability or seasonality.",
  ];

  if (result.premiumEconomyFallback) {
    // The engine substitutes economy fares x1.6 when it has no premium-economy
    // history, and says nothing. A customer must not be told that is real data.
    caveats.push(
      "We have no recorded premium economy fares for this route, so this figure is estimated up from economy and is less reliable than usual.",
    );
  }

  if (result.coverage.total > 0 && result.coverage.priced < result.coverage.total) {
    caveats.push("Some parts of this route have no fare history, so the real total may sit above this range.");
  }

  return caveats;
}

export async function routeEstimate(args: {
  cities: string[];
  cabin?: Cabin;
}): Promise<RouteEstimateResult> {
  const backend = getPricingBackend();
  if (!backend) return forwardPricingRequest("route_estimate", args);

  const cabin: Cabin = args.cabin ?? "economy";

  if (!backend.isConfigured()) {
    return {
      route: (args.cities ?? []).join("-"),
      cabin,
      message: "Price ranges aren't available right now.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  let result: EstimateResult;
  try {
    result = await backend.estimateRoute({ route: args.cities, cabin });
  } catch (err: any) {
    return {
      route: (args.cities ?? []).join("-"),
      cabin,
      error: err?.message || "We couldn't work out a price range for this route.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  if (result.low === null || result.high === null) {
    return {
      route: result.route,
      cabin: result.cabin,
      message:
        result.message ??
        "We have no recorded fares for this route yet, so we can't put a range on it. An AirTreks consultant can price it directly.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  // Don't claim fare history for a number that was extrapolated from another
  // cabin. The caveats say so too, but the headline must not contradict them.
  const source = result.premiumEconomyFallback
    ? "estimated up from economy fares"
    : "from AirTreks fare history";

  return {
    route: result.route,
    cabin: result.cabin,
    currency: result.currency,
    estimate: { low: result.low, high: result.high },
    confidence: result.confidence,
    basis: `${money(result.low)}-${money(result.high)} ${result.currency} per person, ${source}. ${describeConfidence(result)}`,
    caveats: buildCaveats(result),
    planYourTrip: TRIP_PLANNER_URL,
  };
}
