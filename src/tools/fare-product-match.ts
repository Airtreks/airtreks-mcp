import { z } from "zod";
import { fareProducts, recommendFareProduct } from "../data/fare-products.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";
import { detectDirection } from "./plan-route.js";

export const fareProductMatchSchema = {
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes"),
  isOneDirection: z.boolean().optional().describe("Is the route traveling continuously in one direction (east or west)? Leave it out and it is worked out from the cities."),
  includeBacktracking: z.boolean().optional().describe("Does the route backtrack or zigzag between regions? Leave it out and it is worked out from the cities."),
};

export function fareProductMatch(args: {
  cities: string[];
  isOneDirection?: boolean;
  includeBacktracking?: boolean;
}) {
  const { cities } = args;
  // No silent defaults (AIR-1391): assuming "one direction" made a Pacific out-and-back
  // look like a classic round-the-world fare. Work it out from the cities unless told.
  const detected = detectDirection(cities);
  const isOneDirection = args.isOneDirection ?? detected.direction !== "mixed";
  const includeBacktracking = args.includeBacktracking ?? detected.backtracking;
  const directionBasis = args.isOneDirection === undefined ? `worked out from the cities: ${detected.direction}` : "as you stated";
  const legs = cities.length - 1;
  const isRoundTrip = cities[0]?.toUpperCase() === cities[cities.length - 1]?.toUpperCase();

  const recommendations = recommendFareProduct(cities, isOneDirection);

  // Add backtracking note
  if (includeBacktracking) {
    recommendations.unshift({
      product: fareProducts.find((f) => f.code === "MC")!,
      confidence: "high",
      reason: "Route includes backtracking — alliance RTW fares require continuous eastbound/westbound travel. Custom fare construction needed.",
      warnings: [],
    });
  }

  return {
    route: cities.join(" → "),
    legs,
    isRoundTrip,
    directionBasis,
    recommendations: recommendations.map((r) => ({
      fareProduct: r.product.name,
      code: r.product.code,
      confidence: r.confidence,
      reason: r.reason,
      warnings: r.warnings,
      alliances: r.product.alliances,
      typicalPrice: r.product.typicalPriceRange,
      description: r.product.description,
      directionRule: r.product.directionRule,
    })),
    allFareProducts: fareProducts.map((f) => ({
      name: f.name,
      code: f.code,
      bestFor: f.bestFor,
    })),
    bookWithAirTreks: TRIP_PLANNER_URL,
  };
}
