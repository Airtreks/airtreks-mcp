import { z } from "zod";
import { TRIP_PLANNER_URL, describeFlight } from "../lib/links.js";
import { findAirportChanges } from "../lib/airport-changes.js";
import {
  forwardPricingRequest,
  getPricingBackend,
  type Cabin,
  type QuoteJobState,
} from "../lib/pricing-backend.js";

/** A single fare cannot span an unlimited trip, and each place widens the fan-out. */
const MAX_PLACES = 12;

/**
 * Upstream searches a quote of this size costs.
 *
 * The upstream generates roughly 4N-5 searches for a route with no hub splits and
 * up to 12N-17 when every leg gets one — and hub splits happen on cross-region
 * legs, which is most of what this tool is for. So charge the upper shape: the
 * budget must not be understated by the tool that spends the most.
 */
export function estimateSearches(args: { cities?: string[] }): number {
  const places = (args?.cities ?? []).filter((c) => c !== "000").length;
  const legs = Math.max(1, places - 1);
  return legs < 3 ? Math.max(3, 3 * legs) : 12 * legs - 17;
}

export const itineraryQuoteSchema = {
  cities: z
    .array(z.string())
    .min(2)
    .max(MAX_PLACES)
    .describe(
      "Ordered list of IATA city/airport codes for the whole trip, e.g. ['LAX','NRT','BKK','LHR','LAX']. " +
        "Put '000' between two codes to mark that leg as travelled overland rather than flown.",
    ),
  dates: z
    .array(z.string())
    .min(1)
    .describe("Departure date for each FLOWN leg, in travel order, as YYYY-MM-DD."),
  adults: z.number().int().min(1).max(9).optional().describe("Adult travellers. Defaults to 1."),
  children: z.number().int().min(0).max(8).optional().describe("Children aged 2-11."),
  infants: z.number().int().min(0).max(8).optional().describe("Infants under 2."),
  cabin: z
    .enum(["economy", "premium", "business", "first"])
    .optional()
    .describe("Cabin to price. Defaults to economy. 'premium' means premium economy."),
};

export const itineraryQuoteStatusSchema = {
  quoteReference: z
    .string()
    .min(20)
    .describe("The quoteReference returned by itinerary_quote."),
};

export async function itineraryQuote(args: {
  cities: string[];
  dates: string[];
  adults?: number;
  children?: number;
  infants?: number;
  cabin?: Cabin;
}): Promise<Record<string, unknown>> {
  const backend = getPricingBackend();
  if (!backend) return forwardPricingRequest("itinerary_quote", args);

  const cabin: Cabin = args.cabin ?? "economy";
  const route = (args.cities ?? []).join("-");

  if (!backend.isConfigured()) {
    return {
      route,
      message: "Itinerary pricing isn't available right now.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  try {
    const { handle, retryAfterSeconds } = await backend.startItineraryQuote({
      route: args.cities,
      dates: args.dates,
      passengers: {
        adults: args.adults ?? 1,
        children: args.children ?? 0,
        infants: args.infants ?? 0,
      },
      cabin,
    });

    return {
      route,
      cabin,
      status: "pending",
      quoteReference: handle,
      // Spelled out because an agent that does not hold the reference cannot get
      // the answer back — there is no way to look a quote up by its question.
      nextStep: `Pricing a trip this size takes around a minute. Call itinerary_quote_status with quoteReference "${handle}" in about ${retryAfterSeconds} seconds. Keep that reference: it is the only way to retrieve this quote.`,
      retryAfterSeconds,
    };
  } catch (err: any) {
    return {
      route,
      cabin,
      error: err?.message || "We couldn't start pricing this trip.",
      tryInstead:
        "route_estimate gives a price range for the same cities immediately, without needing dates.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }
}

function money(value: number | null, currency: string): string {
  return value === null ? "unpriced" : `${Math.round(value).toLocaleString("en-US")} ${currency}`;
}

export async function itineraryQuoteStatus(args: {
  quoteReference: string;
}): Promise<Record<string, unknown>> {
  const backend = getPricingBackend();
  if (!backend) return forwardPricingRequest("itinerary_quote_status", args);

  if (!backend.isConfigured()) {
    return { message: "Itinerary pricing isn't available right now.", planYourTrip: TRIP_PLANNER_URL };
  }

  let state: QuoteJobState;
  try {
    state = await backend.getItineraryQuote(args.quoteReference);
  } catch (err: any) {
    return { error: err?.message || "We couldn't retrieve that quote.", planYourTrip: TRIP_PLANNER_URL };
  }

  if (state.status === "pending") {
    return {
      status: "pending",
      retryAfterSeconds: state.retryAfterSeconds ?? 10,
      nextStep: `Still pricing. Call itinerary_quote_status again with the same quoteReference in about ${state.retryAfterSeconds ?? 10} seconds.`,
    };
  }

  if (state.status === "unknown" || state.status === "failed") {
    return {
      status: state.status,
      message: state.message ?? "We couldn't price this trip.",
      tryInstead: "route_estimate gives a price range for the same cities immediately.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  const currency = state.currency ?? "USD";
  const options = state.options ?? [];

  if (!options.length) {
    return {
      status: "ready",
      route: state.route,
      message:
        state.message ??
        "We couldn't price this trip. Trips this complex sometimes need a consultant to build by hand.",
      unpricedSegments: state.unpriced?.length ? state.unpriced : undefined,
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  return {
    status: "ready",
    route: state.route,
    cabin: state.cabin,
    currency,
    // Multi-stop trips are usually cheaper split across several tickets, and the
    // splits differ enough that the choice is the answer, not a detail.
    options: options.map((option) => ({
      bestFor: option.bestFor,
      totalForParty: option.total,
      perTraveller: option.perPassengerType.map((p) =>
        p.count === 1
          ? `1 ${p.type}: ${money(p.each, currency)}`
          : `${p.count} ${p.type}s at ${money(p.each, currency)} each = ${money(p.total, currency)}`,
      ),
      ticketCount: option.tickets.length,
      tickets: option.tickets.map((ticket) => ({
        covers: ticket.covers,
        eachTraveller: ticket.each,
        totalForParty: ticket.total,
        flights: ticket.legs.map((leg) => leg.flights.map(describeFlight).join(", ")),
        baggage: ticket.baggage,
      })),
      stops: option.stops,
      // Across tickets, not within one: separate tickets are chosen
      // independently, so nothing makes them agree on an airport, and this is
      // where a DMK-in/BKK-out change actually shows up.
      airportChanges: (() => {
        const changes = findAirportChanges(
          option.tickets.flatMap((t) => t.legs.flatMap((l) => l.flights)),
        );
        return changes.length ? changes : undefined;
      })(),
      durationHours:
        option.durationMinutes && option.durationMinutes > 0
          ? Math.round((option.durationMinutes / 60) * 10) / 10
          : undefined,
    })),
    unpricedSegments: state.unpriced?.length ? state.unpriced : undefined,
    caveats: [
      "These are live fares for the dates given — availability and price can change between now and booking.",
      ...(options.some((o) =>
        o.tickets.some((t) => t.legs.some((l) => l.flights.some((f) => !!f.operatedBy))),
      )
        ? [
            "Some flights are sold by one airline and flown by another — those are marked \"operated by\". The operating airline determines the aircraft, seat and service.",
          ]
        : []),
      "Each option is a different way of ticketing the same trip. Cheaper ones usually mean more stops or separate tickets, which are booked independently and don't protect each other if a flight is missed.",
    ],
    planYourTrip: TRIP_PLANNER_URL,
  };
}
