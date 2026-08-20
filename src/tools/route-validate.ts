import { z } from "zod";
import { findCarrier, allAlliances, excludedCarriers } from "../data/alliances.js";
import { isDeadLeg, hubRules, bookabilityByLegCount } from "../data/hubs.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const routeValidateSchema = {
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes (e.g. ['LAX', 'NRT', 'BKK', 'LHR', 'LAX'])"),
  carriers: z.array(z.string()).optional().describe("Optional carrier codes for each leg (e.g. ['NH', 'TG', 'BA', 'BA'])"),
  alliance: z.string().optional().describe("Preferred alliance: 'star' or 'oneworld'"),
};

export function routeValidate(args: {
  cities: string[];
  carriers?: string[];
  alliance?: string;
}) {
  const { cities, carriers, alliance } = args;
  const legs = cities.length - 1;

  if (legs < 1) {
    return { isValid: false, errors: ["Need at least 2 cities to form a route."], warnings: [], suggestions: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check if it's a round trip
  const isRoundTrip = cities[0].toUpperCase() === cities[cities.length - 1].toUpperCase();
  if (!isRoundTrip) {
    warnings.push(`Route doesn't return to origin (${cities[0]}). RTW fares require same start/end city.`);
  }

  // Check leg count bookability
  const legBand = bookabilityByLegCount.find((b) => {
    if (b.legs === "3-4") return legs >= 3 && legs <= 4;
    if (b.legs === "5-6") return legs >= 5 && legs <= 6;
    if (b.legs === "7+") return legs >= 7;
    return false;
  });
  if (legBand) {
    if (legBand.successRate < 50) {
      warnings.push(`${legs} legs has only ${legBand.successRate}% bookability on alliance fares. ${legBand.recommendation}.`);
    }
  }

  // Check carriers against alliance
  if (carriers && carriers.length > 0) {
    for (const code of carriers) {
      // Check excluded carriers
      const excluded = excludedCarriers.find((e) => e.code === code.toUpperCase());
      if (excluded) {
        errors.push(`${code} (${excluded.name}): ${excluded.reason}`);
        continue;
      }

      const found = findCarrier(code);
      if (!found) {
        warnings.push(`${code}: Unknown carrier — not in Star Alliance or oneworld. May not be valid for alliance RTW fares.`);
        continue;
      }

      // Check if poison carrier
      if (found.alliance.poisonCarriers.includes(code.toUpperCase())) {
        warnings.push(`${code} (${found.carrier.name}) has <10% RTW bookability — poison carrier. Consider alternatives.`);
      }

      // Check alliance consistency
      if (alliance) {
        const allianceName = alliance.toLowerCase().includes("star") ? "Star Alliance" : "oneworld";
        if (found.alliance.name !== allianceName) {
          errors.push(`${code} (${found.carrier.name}) is ${found.alliance.name}, but you specified ${allianceName}. Alliance RTW fares require all carriers from the same alliance.`);
        }
      }
    }
  }

  // Check for dead legs
  for (let i = 0; i < legs; i++) {
    const from = cities[i].toUpperCase();
    const to = cities[i + 1].toUpperCase();
    const carrier = carriers?.[i]?.toUpperCase();

    const dead = isDeadLeg(from, to, carrier);
    if (dead) {
      const rule = hubRules.find((r) => r.deadLegs.some((d) => d.from === from && d.to === to));
      errors.push(
        `${from}-${to}${carrier ? ` on ${carrier}` : ""}: Dead leg (${dead.bookability}% bookability). ${rule?.fixes[0] || "Reroute via a hub."}`
      );
      if (rule) {
        suggestions.push(...rule.fixes);
      }
    }
  }

  // Direction check (simplified — checks ocean crossings)
  const cityList = cities.map((c) => c.toUpperCase());
  // Just note the direction if detectable
  if (isRoundTrip && legs >= 3) {
    suggestions.push("For RTW fares, ensure travel is continuously eastbound or westbound — no backtracking across oceans.");
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    legs,
    isRoundTrip,
    route: cities.join(" → "),
    errors,
    warnings,
    suggestions: [...new Set(suggestions)],
    bookabilityNote: legBand
      ? `${legs} legs: ${legBand.successRate}% historical bookability — ${legBand.recommendation}`
      : `${legs} legs`,
    bookWithAirTreks: TRIP_PLANNER_URL,
  };
}
