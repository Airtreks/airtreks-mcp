/**
 * The seam between the public MCP package and AirTreks' pricing systems
 * (AIR-807), following the same shape as trip-backend.ts (AIR-803).
 *
 * The public package ships with NO backend registered: the pricing tools
 * forward the whole call to the hosted API at mcp.airtreks.com, which holds the
 * upstream URL and credentials and runs the request server-side. The hosted
 * deployment (private repo) injects a real PricingBackend via
 * setPricingBackend() at startup, which switches the tools to run locally.
 *
 * Deliberately, no upstream hostname, path or credential appears in this file.
 * This package is published to npm and several public MCP directories.
 */

/** Cabin, in customer terms. Backends map these to their own codes. */
export type Cabin = "economy" | "premium" | "business" | "first";

/** How much recorded history sits behind a number. */
export type Confidence = "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// Estimates — a historical price band. No live availability, no live search.
// ---------------------------------------------------------------------------

export interface EstimateOpts {
  /**
   * IATA codes in travel order. The literal "000" marks the leg *before* it as
   * travelled overland, so it is not priced as a flight:
   * ["PDX","000","LAX","NRT"] flies LAX->NRT only.
   */
  route: string[];
  cabin?: Cabin;
}

export interface EstimateResult {
  /** Normalised route as priced, e.g. "LAX-NRT-BKK". */
  route: string;
  cabin: Cabin;
  currency: string;
  /** Band bounds; null when there is no history for this route. */
  low: number | null;
  high: number | null;
  confidence: Confidence;
  /**
   * True when a premium-economy request was answered from economy history with
   * an uplift, rather than from recorded premium-economy fares. The number is
   * an extrapolation and must be presented as such.
   */
  premiumEconomyFallback: boolean;
  /** How many of the priced units behind this route had recorded fares. */
  coverage: { priced: number; total: number };
  /** Set when no band could be produced; safe to show a customer. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Fare quote — one specific itinerary, priced live.
// ---------------------------------------------------------------------------

export interface Passengers {
  adults?: number;
  children?: number;
  infants?: number;
}

export interface FareQuoteOpts {
  /** IATA codes in travel order. "000" marks the preceding leg as overland. */
  route: string[];
  /** YYYY-MM-DD, one per flown leg, in the same order. */
  dates: string[];
  passengers?: Passengers;
  cabin?: Cabin;
  /** Cap on returned options. Backends may clamp this. */
  maxOptions?: number;
}

export interface QuotedFlight {
  from: string;
  to: string;
  /** Marketing carrier — the airline whose code is on the ticket. */
  airline?: string;
  /**
   * Operating carrier, set ONLY when it differs from the marketing one.
   *
   * Its presence is the signal that this leg is a codeshare, so a consumer can
   * branch on that rather than compare two codes. An IATA code rather than a
   * name: our carrier tables are curated for routing advice and cover about a
   * quarter of the codes that turn up here, so resolving names would be absent
   * more often than present — and a code is something an agent can expand.
   */
  operatedBy?: string;
  flightNumber?: string;
  departsAt?: string;
  arrivesAt?: string;
}

export interface QuotedLeg {
  flights: QuotedFlight[];
  /** Minutes, first departure to last arrival. */
  durationMinutes?: number;
  stops: number;
}

export interface PricePerPassengerType {
  /** Customer-facing label: "adult", "child", "infant". */
  type: string;
  count: number;
  /** What ONE traveller of this type pays. */
  each: number;
  /** What all `count` travellers of this type pay together, i.e. each x count. */
  total: number;
}

export interface FareOption {
  /**
   * All-in customer price for the whole itinerary, for EVERY traveller together.
   *
   * Backends must compute this from the per-passenger rows and their counts.
   * The upstream's own total cannot be trusted for it — see the note in the
   * hosted backend. Getting this wrong understates a family's price by roughly
   * the number of travellers (AIR-808).
   */
  total: number | null;
  currency: string;
  perPassengerType: PricePerPassengerType[];
  legs: QuotedLeg[];
  /** Free checked baggage, e.g. "1 piece" / "23 kg". Null when unknown. */
  baggage: string | null;
}

export interface FareQuoteResult {
  route: string;
  cabin: Cabin;
  currency: string;
  options: FareOption[];
  /** True when served from recently cached fares rather than a fresh search. */
  cached: boolean;
  /** Set when nothing could be priced; safe to show a customer. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Itinerary quote — a multi-stop trip priced across several tickets, async.
// ---------------------------------------------------------------------------

export interface ItineraryQuoteOpts {
  /** IATA codes in travel order. "000" marks the preceding leg as overland. */
  route: string[];
  /** YYYY-MM-DD, one per flown leg, in the same order. */
  dates: string[];
  passengers?: Passengers;
  cabin?: Cabin;
}

/**
 * One way of ticketing the trip. A multi-stop itinerary is usually cheaper split
 * across several tickets than bought as one fare, and the splits differ in price,
 * duration and stops — so each option is a genuine alternative, not a variant.
 */
export interface ItineraryOption {
  /** What this way of splitting optimises for, in plain terms. */
  bestFor: string;
  /** Price for EVERY traveller together, across all the tickets below. */
  total: number | null;
  currency: string;
  perPassengerType: PricePerPassengerType[];
  /** The separately-priced tickets this option is built from. */
  tickets: {
    covers: string;
    /** What ONE traveller pays for this ticket. */
    each: number | null;
    /** What every traveller pays for this ticket together. */
    total: number | null;
    legs: QuotedLeg[];
    baggage: string | null;
  }[];
  durationMinutes?: number;
  stops: number;
}

export type QuoteJobStatus = "pending" | "ready" | "failed" | "unknown";

export interface QuoteJobState {
  status: QuoteJobStatus;
  /** Seconds to wait before asking again. Only meaningful while pending. */
  retryAfterSeconds?: number;
  route?: string;
  cabin?: Cabin;
  currency?: string;
  options?: ItineraryOption[];
  /** Route segments that could not be priced at all. */
  unpriced?: string[];
  /** Safe to show a customer. Set on failure, or when nothing could be priced. */
  message?: string;
}

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

export interface PricingBackend {
  /** Whether the backend has what it needs to answer pricing calls. */
  isConfigured(): boolean;
  /** Historical price band for a route. No live search. */
  estimateRoute(opts: EstimateOpts): Promise<EstimateResult>;
  /** Live price for one specific itinerary. */
  quoteFare(opts: FareQuoteOpts): Promise<FareQuoteResult>;
  /**
   * Begin pricing a multi-stop trip. Returns immediately with a handle.
   *
   * Async because this is the slow one: the upstream fans out across many
   * provider searches and takes tens of seconds, which does not survive an MCP
   * client's patience.
   *
   * The handle is the capability. It must be unguessable and is the only thing
   * that can read the result — there is no separate ownership check, because a
   * tool has no access to caller identity. A handle derived from the request
   * (a hash of the arguments, say) would let anyone who could guess the question
   * read someone else's paid answer, so it must be random.
   */
  startItineraryQuote(opts: ItineraryQuoteOpts): Promise<{ handle: string; retryAfterSeconds: number }>;
  /** Read a job by its handle. Unknown or expired handles report "unknown". */
  getItineraryQuote(handle: string): Promise<QuoteJobState>;
}

let backend: PricingBackend | null = null;

/** Called by the hosted deployment at startup, before the server starts. */
export function setPricingBackend(b: PricingBackend | null) {
  backend = b;
}

export function getPricingBackend(): PricingBackend | null {
  return backend;
}

const HOSTED_API = process.env.AIRTREKS_API_URL || "https://mcp.airtreks.com";

/**
 * Public-package mode: relay the tool call to the hosted API, which holds the
 * upstream credentials.
 *
 * Unlike forwardTripRequest, the pricing tools are free, so no AirTreks API key
 * is required. One is sent when AIRTREKS_API_KEY is set so a registered caller
 * gets their own rate limit rather than the shared anonymous one.
 */
export async function forwardPricingRequest(tool: string, args: unknown): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.AIRTREKS_API_KEY;
  if (key) headers["X-API-Key"] = key;

  try {
    const res = await fetch(`${HOSTED_API}/api/${tool}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args ?? {}),
    });
    try {
      return await res.json();
    } catch {
      return { error: `The pricing service returned status ${res.status}.` };
    }
  } catch {
    return { error: "The pricing service is unreachable right now. Please try again shortly." };
  }
}
