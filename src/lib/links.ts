/**
 * Canonical AirTreks TripPlanner entry point.
 *
 * NOT https://www.airtreks.com/trip-planner/ — that path 404s (AIR-785). The
 * TripPlanner runs on its own host, and airtreks.com's own CTAs all point here.
 *
 * A route-prefill path already exists at /route/:routeString — IATA codes joined
 * by "-", with "000" between two codes marking a surface sector, e.g.
 * /route/PDX-NRT-BKK-DEL-LHR-PDX or /route/HAN-000-SGN-SYD. Emitting prefilled
 * links from the routing tools is AIR-746; this constant is the seam for it.
 */
export const TRIP_PLANNER_URL = "https://tripplanner.airtreks.com/";

/**
 * One flight as a customer-readable string.
 *
 * Names the operating carrier when it differs from the marketing one. A customer
 * who books `UA9729` and boards a Swiss aircraft contacts support, and a
 * consultant would always have mentioned it (AIR-810).
 */
export function describeFlight(f: {
  from: string;
  to: string;
  airline?: string;
  operatedBy?: string;
  flightNumber?: string;
}): string {
  const leg = `${f.from}→${f.to}`;
  if (!f.airline) return leg;
  const flight = `${f.airline}${f.flightNumber ?? ""}`;
  return f.operatedBy ? `${leg} ${flight}, operated by ${f.operatedBy}` : `${leg} ${flight}`;
}
