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
  /** Total recorded fares behind the band. */
  observations: number;
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
  airline?: string;
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
  /** Total for all passengers of this type. */
  total: number;
}

export interface FareOption {
  /** All-in customer price for the whole itinerary, all passengers. */
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
// The seam
// ---------------------------------------------------------------------------

export interface PricingBackend {
  /** Whether the backend has what it needs to answer pricing calls. */
  isConfigured(): boolean;
  /** Historical price band for a route. No live search. */
  estimateRoute(opts: EstimateOpts): Promise<EstimateResult>;
  /** Live price for one specific itinerary. */
  quoteFare(opts: FareQuoteOpts): Promise<FareQuoteResult>;
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
