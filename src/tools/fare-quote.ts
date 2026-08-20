import { z } from "zod";
import { TRIP_PLANNER_URL } from "../lib/links.js";
import {
  forwardPricingRequest,
  getPricingBackend,
  type Cabin,
  type FareQuoteResult,
} from "../lib/pricing-backend.js";

/**
 * Tighter than route_estimate's cap. Every call here is a live fare search
 * against the GDS, so this is a cost ceiling as much as a work one, and one
 * fare cannot span an unlimited itinerary anyway.
 */
const MAX_PLACES = 10;

/** Options to return. More than a handful is noise for an agent to relay. */
const DEFAULT_OPTIONS = 5;
const MAX_OPTIONS = 10;

export const fareQuoteSchema = {
  cities: z
    .array(z.string())
    .min(2)
    .max(MAX_PLACES)
    .describe(
      "Ordered list of IATA city/airport codes, e.g. ['LAX','NRT','BKK']. " +
        "Put '000' between two codes to mark that leg as travelled overland rather than flown.",
    ),
  dates: z
    .array(z.string())
    .min(1)
    .describe(
      "Departure date for each FLOWN leg, in travel order, as YYYY-MM-DD. " +
        "Overland legs marked with '000' do not take a date.",
    ),
  adults: z.number().int().min(1).max(9).optional().describe("Adult travellers. Defaults to 1."),
  children: z.number().int().min(0).max(8).optional().describe("Children aged 2-11."),
  infants: z.number().int().min(0).max(8).optional().describe("Infants under 2."),
  cabin: z
    .enum(["economy", "premium", "business", "first"])
    .optional()
    .describe("Cabin to price. Defaults to economy. 'premium' means premium economy."),
  maxOptions: z
    .number()
    .int()
    .min(1)
    .max(MAX_OPTIONS)
    .optional()
    .describe(`How many fare options to return. Defaults to ${DEFAULT_OPTIONS}.`),
};

export interface FareQuoteToolResult {
  route: string;
  cabin: Cabin;
  currency?: string;
  travellers?: string;
  options?: {
    total: number | null;
    perTraveller: string[];
    flights: string[];
    stops: number;
    durationHours?: number;
    baggage: string | null;
  }[];
  priced?: string;
  caveats?: string[];
  planYourTrip?: string;
  message?: string;
  error?: string;
  tryInstead?: string;
}

function describeTravellers(a: number, c: number, i: number): string {
  const parts: string[] = [`${a} adult${a === 1 ? "" : "s"}`];
  if (c > 0) parts.push(`${c} child${c === 1 ? "" : "ren"}`);
  if (i > 0) parts.push(`${i} infant${i === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function money(value: number, currency: string): string {
  return `${Math.round(value).toLocaleString("en-US")} ${currency}`;
}

export async function fareQuote(args: {
  cities: string[];
  dates: string[];
  adults?: number;
  children?: number;
  infants?: number;
  cabin?: Cabin;
  maxOptions?: number;
}): Promise<FareQuoteToolResult> {
  const backend = getPricingBackend();
  if (!backend) return forwardPricingRequest("fare_quote", args);

  const cabin: Cabin = args.cabin ?? "economy";
  const route = (args.cities ?? []).join("-");

  if (!backend.isConfigured()) {
    return {
      route,
      cabin,
      message: "Live fare pricing isn't available right now.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  const adults = args.adults ?? 1;
  const children = args.children ?? 0;
  const infants = args.infants ?? 0;

  let result: FareQuoteResult;
  try {
    result = await backend.quoteFare({
      route: args.cities,
      dates: args.dates,
      passengers: { adults, children, infants },
      cabin,
      maxOptions: args.maxOptions ?? DEFAULT_OPTIONS,
    });
  } catch (err: any) {
    // Live pricing is the slowest and most failure-prone thing this server does,
    // so give the agent somewhere to go rather than a dead end.
    return {
      route,
      cabin,
      error: err?.message || "We couldn't price this itinerary.",
      tryInstead:
        "route_estimate gives a price range for the same cities without needing dates, and answers in well under a second.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  const travellers = describeTravellers(adults, children, infants);

  if (!result.options.length) {
    return {
      route: result.route,
      cabin: result.cabin,
      travellers,
      message:
        result.message ??
        "We couldn't price this itinerary as a single fare. Complex multi-stop trips often need to be split across separate tickets — an AirTreks consultant builds those by hand.",
      planYourTrip: TRIP_PLANNER_URL,
    };
  }

  const currency = result.currency;

  return {
    route: result.route,
    cabin: result.cabin,
    currency,
    travellers,
    options: result.options.map((option) => {
      const minutes = option.legs.reduce((sum, leg) => sum + (leg.durationMinutes ?? 0), 0);
      return {
        total: option.total,
        perTraveller: option.perPassengerType.map(
          (p) => `${p.count} × ${p.type}: ${money(p.total, currency)}`,
        ),
        flights: option.legs.map((leg) =>
          leg.flights
            .map((f) => `${f.from}→${f.to}${f.airline ? ` ${f.airline}${f.flightNumber ?? ""}` : ""}`)
            .join(", "),
        ),
        stops: option.legs.reduce((sum, leg) => sum + leg.stops, 0),
        durationHours: minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : undefined,
        baggage: option.baggage,
      };
    }),
    priced: `Live fare for ${travellers}, total for the whole party in ${currency}.`,
    caveats: [
      "These are live fares for the dates given — availability and price can change between now and booking.",
      result.cached
        ? "Served from fares retrieved in the last few minutes rather than a fresh search."
        : "Retrieved just now.",
    ],
    planYourTrip: TRIP_PLANNER_URL,
  };
}
