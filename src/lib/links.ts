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
