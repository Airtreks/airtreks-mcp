import { z } from "zod";
import { TRIP_PLANNER_URL, describeFlight } from "../lib/links.js";
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

/**
 * Flown legs beyond which a single ticket stops being a sensible way to buy the
 * trip. Measured on OTP-BKK-SYD-LAX-LIS-OTP for 2027 dates: one ticket covering
 * all five legs priced at 11,117 USD per person, while the same trip split
 * across five tickets came back at 2,238 — and the historical estimate for the
 * route agreed with the split figure, not the through-fare. Four times the price
 * for the same journey.
 *
 * Three is where AirTreks' whole premise starts applying, so that is the trigger.
 */
const SPLIT_TICKET_HINT_LEGS = 3;

export interface FareQuoteToolResult {
  route: string;
  cabin: Cabin;
  currency?: string;
  travellers?: string;
  options?: {
    totalForParty: number | null;
    perTraveller: string[];
    flights: string[];
    stops: number;
    durationHours?: number;
    baggage: string | null;
  }[];
  priced?: string;
  caveats?: string[];
  alsoConsider?: string;
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

/** True when any leg is sold by one carrier and flown by another. */
function hasCodeshare(options: { legs: { flights: { operatedBy?: string }[] }[] }[]): boolean {
  return options.some((o) => o.legs.some((l) => l.flights.some((f) => !!f.operatedBy)));
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
  const places = (args.cities ?? []).filter((c) => c !== "000");
  const flownLegs = Math.max(1, places.length - 1);

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
        totalForParty: option.total,
        // "2 adults at 492 USD each = 985 USD" — the old form read
        // "2 × adult: 985 USD", which an agent could take either as the party
        // total or as the price each. It was neither, reliably (AIR-808).
        perTraveller: option.perPassengerType.map((p) =>
          p.count === 1
            ? `1 ${p.type}: ${money(p.each, currency)}`
            : `${p.count} ${p.type}s at ${money(p.each, currency)} each = ${money(p.total, currency)}`,
        ),
        flights: option.legs.map((leg) => leg.flights.map(describeFlight).join(", ")),
        stops: option.legs.reduce((sum, leg) => sum + leg.stops, 0),
        durationHours: minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : undefined,
        baggage: option.baggage,
      };
    }),
    priced: `Live fare for ${travellers}. \`totalForParty\` is what everyone pays together, in ${currency}; the per-traveller lines give the price each.`,
    // A single fare across many legs is technically a valid answer and
    // commercially a poor one. Returning it without saying so is how an agent
    // quotes four times the necessary price and loses the trip (AIR-808).
    ...(flownLegs >= SPLIT_TICKET_HINT_LEGS
      ? {
          alsoConsider:
            `This is priced as ONE ticket covering all ${flownLegs} flights. On multi-stop trips that is usually far more expensive than buying separate tickets — often several times more. ` +
            `itinerary_quote prices this same trip split across tickets and is very likely to come back much lower; worth calling before quoting this figure to anyone.`,
        }
      : {}),
    caveats: [
      "These are live fares for the dates given — availability and price can change between now and booking.",
      ...(hasCodeshare(result.options)
        ? [
            "Some flights are sold by one airline and flown by another — those are marked \"operated by\". The operating airline determines the aircraft, seat and service, so it is worth telling the customer.",
          ]
        : []),
      result.cached
        ? "Served from fares retrieved in the last few minutes rather than a fresh search."
        : "Retrieved just now.",
    ],
    planYourTrip: TRIP_PLANNER_URL,
  };
}
