import { z } from "zod";
import { searchTemplates } from "../data/routes.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const routeSuggestSchema = {
  regions: z.array(z.string()).describe("Regions to visit: 'asia', 'europe', 'oceania', 'americas', 'africa', 'middle east', 'south america'"),
  direction: z.enum(["eastbound", "westbound", "either"]).optional().describe("Travel direction preference"),
  alliance: z.string().optional().describe("Preferred alliance: 'star' or 'oneworld'"),
  maxStops: z.number().optional().describe("Maximum number of stops (legs). 3-6 recommended for best bookability."),
  tripType: z.string().optional().describe("Trip type hint: 'honeymoon', 'backpacker', 'business', 'family', etc."),
};

export function routeSuggest(args: {
  regions: string[];
  direction?: string;
  alliance?: string;
  maxStops?: number;
  tripType?: string;
}) {
  const matches = searchTemplates({
    regions: args.regions,
    direction: args.direction,
    alliance: args.alliance,
    maxLegs: args.maxStops,
  });

  // Sort by bookability (fewer legs = better)
  const sorted = matches.sort((a, b) => a.legs - b.legs);
  const top = sorted.slice(0, 3);

  if (top.length === 0) {
    return {
      suggestions: [],
      message: `No template routes found for ${args.regions.join(" + ")}. AirTreks specializes in building custom routes for complex itineraries — a consultant can craft the perfect routing.`,
      bookWithAirTreks: TRIP_PLANNER_URL,
    };
  }

  return {
    suggestions: top.map((t) => ({
      name: t.name,
      route: t.cities.join(" → "),
      legs: t.legs,
      direction: t.direction,
      alliance: t.alliance,
      bookability: t.bookability,
      notes: t.notes,
      regions: t.regions,
    })),
    tip: args.maxStops && args.maxStops >= 7
      ? "7+ stops drops alliance fare bookability below 6%. AirTreks custom fare construction handles complex routes that alliance fares can't."
      : "3-6 stops is the sweet spot for alliance fares (61-91% bookability).",
    bookWithAirTreks: TRIP_PLANNER_URL,
  };
}
