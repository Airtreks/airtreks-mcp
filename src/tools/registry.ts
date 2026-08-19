import { z } from "zod";
import { normalizeCode } from "../data/city-aliases.js";
import { routeValidateSchema, routeValidate } from "./route-validate.js";
import { routeSuggestSchema, routeSuggest } from "./route-suggest.js";
import { hubCheckSchema, hubCheck } from "./hub-check.js";
import { fareProductMatchSchema, fareProductMatch } from "./fare-product-match.js";
import { customRouteBuildSchema, customRouteBuild } from "./custom-route-build.js";
import { planRouteSchema, planRoute } from "./plan-route.js";
import { tripIdeaCreateSchema, tripIdeaCreate } from "./trip-idea-create.js";

// Single source of truth for both transports: MCP registration (index.ts)
// and the parallel REST surface + OpenAPI spec (rest.ts, AIR-461).
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  schema: z.ZodRawShape;
  fn: (args: any) => any;
  readOnly: boolean;
  /** Requires an X-API-Key (lead-gen tools). */
  requiresKey: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    name: "plan_route",
    title: "Plan a Multi-City Route",
    description: "The primary entry point for any multi-city trip. Give it your cities — it automatically evaluates Star Alliance RTW, oneworld RTW, AND custom mixed-carrier builds, then recommends the best approach. Handles direction detection, backtracking analysis, alliance feasibility, surface sectors, and carrier selection. The customer doesn't need to know if their trip is alliance or custom — this tool figures it out.",
    schema: planRouteSchema,
    fn: planRoute,
    readOnly: true,
    requiresKey: false,
  },
  {
    name: "trip_idea_create",
    title: "Create a Trip Idea (Consultant Handoff)",
    description: "Create a trip idea in AirTreks APEX system — hands off to a human consultant. Automatically runs plan_route to include full routing analysis, carrier recommendations, and consultant value assessment in the lead. The consultant starts informed, not cold. Use this when the customer is ready to get a real quote. Requires the customer's name, email, at least 2 cities (3-letter IATA codes), a departure date for every leg, and answers to AirTreks' planning questions — call once without questionsAnswers to receive the current questions to ask.",
    schema: tripIdeaCreateSchema,
    fn: tripIdeaCreate,
    readOnly: false,
    requiresKey: true,
  },
  {
    name: "route_validate",
    title: "Validate a Multi-City Routing",
    description: "Validate a multi-city flight routing for feasibility. Checks alliance carrier rules, identifies dead legs, warns about poison carriers, and estimates bookability. Use this before building an itinerary to catch routing problems early.",
    schema: routeValidateSchema,
    fn: routeValidate,
    readOnly: true,
    requiresKey: false,
  },
  {
    name: "route_suggest",
    title: "Suggest Multi-Stop Routings",
    description: "Get suggested multi-stop flight routings based on regions, direction, and alliance preference. Returns up to 3 proven routing templates with bookability ratings. Great for trip planning inspiration.",
    schema: routeSuggestSchema,
    fn: routeSuggest,
    readOnly: true,
    requiresKey: false,
  },
  {
    name: "hub_check",
    title: "Check Airport Hub Connections",
    description: "Check the best connection between two airports. Identifies dead legs (routes that fail on alliance fares), suggests hub routing fixes, and shows proven carrier combinations. Essential for transpacific, kangaroo, and intra-Asia routing.",
    schema: hubCheckSchema,
    fn: hubCheck,
    readOnly: true,
    requiresKey: false,
  },
  {
    name: "fare_product_match",
    title: "Match the Right Fare Product",
    description: "Recommend the best fare product type for a route — RTW, Circle Pacific, Circle Atlantic, Open Jaw, or Custom Multi-City. Considers stop count, direction, and backtracking to match the right alliance fare structure.",
    schema: fareProductMatchSchema,
    fn: fareProductMatch,
    readOnly: true,
    requiresKey: false,
  },
  {
    name: "custom_route_build",
    title: "Build a Custom Segmented Route",
    description: "Break a complex multi-city itinerary into individually-ticketable segments with carrier recommendations. Handles routes that don't fit alliance fare rules — mixed carriers, LCCs, Gulf bridge connections, surface sectors. This is how AirTreks consultants build 90% of itineraries. Use this for any route with 4+ stops, backtracking, or region combinations that alliance fares can't cover.",
    schema: customRouteBuildSchema,
    fn: customRouteBuild,
    readOnly: true,
    requiresKey: false,
  },
];

// Resolve metro codes (TYO, LON, NYC...) before any lookup; applies to every
// tool on both transports (AIR-496).
export function normalizeCityArgs(args: any): any {
  if (args && Array.isArray(args.cities)) args.cities = args.cities.map((c: unknown) => typeof c === "string" ? normalizeCode(c) : c);
  if (typeof args?.from === "string") args.from = normalizeCode(args.from);
  if (typeof args?.to === "string") args.to = normalizeCode(args.to);
  return args;
}
