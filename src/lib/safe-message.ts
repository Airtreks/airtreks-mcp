/**
 * Pricing errors pass through from the supplier. A raw GDS line ("Amadeus error 866: NO FARE
 * FOUND FOR REQUESTED ITINERARY") means nothing to a traveler or an agent, so swap it for plain
 * words and a next step (AIR-1391). Anything that does not look like a supplier line is kept.
 */

const SUPPLIER_LINE = /amadeus|\bgds\b|\berror \d{2,4}\b|NO FARE FOUND|NO FLIGHT|NEED PRICING|INVALID (?:DATE|FORMAT)/i;

export const NO_FARE_MESSAGE =
  "No fare could be priced for this itinerary on these dates. Try nearby dates or fewer stops, use route_estimate for a price range, or hand the trip to a consultant with trip_idea_create.";

export function customerSafeMessage(message: string | undefined | null, fallback: string): string {
  if (!message || !message.trim()) return fallback;
  return SUPPLIER_LINE.test(message) ? NO_FARE_MESSAGE : message;
}

/**
 * The pricing tools default to economy and one adult. The traveler never said so, and the figure
 * looks the same either way, so name the assumption (AIR-1391). Returns undefined when nothing was assumed.
 */
export function assumedDefaults(given: { cabin?: unknown; adults?: unknown }, pricesParty: boolean): string | undefined {
  const parts: string[] = [];
  if (given.cabin === undefined) parts.push("economy cabin (no cabin was given; pass cabin 'premium' for premium economy or 'business' to price those)");
  if (pricesParty && given.adults === undefined) parts.push("1 adult (no passenger count was given; pass adults)");
  return parts.length ? `Priced for ${parts.join(" and ")}. Ask the traveler, then price again if either differs.` : undefined;
}
