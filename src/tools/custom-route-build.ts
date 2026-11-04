import { z } from "zod";
import { findBridge, getAirportRegion } from "../data/region-bridges.js";
import { findSurfaceSector, findSurfaceOpportunities } from "../data/surface-sectors.js";
import { isDeadLeg } from "../data/hubs.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const customRouteBuildSchema = {
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes (e.g. ['LAX', 'NRT', 'BKK', 'CMB', 'NBO', 'LIS', 'LAX'])"),
  budget: z.enum(["budget", "mid", "premium", "business"]).optional().describe("Budget tier the traveler asked for"),
  preferences: z.array(z.string()).optional().describe("Preferences: 'no-lcc', 'lounge-access', 'short-layovers', 'surface-ok'"),
  pax: z.number().optional().describe("Number of passengers"),
};

interface Segment {
  leg: number;
  from: string;
  to: string;
  surfaceSectorCandidate: boolean;
  surfaceNote?: string;
  consultantValue: "low" | "medium" | "high";
  consultantNote?: string;
}

interface SurfaceOpp {
  insteadOf: string;
  suggestion: string;
  savings: string;
}

function scoreConsultantValue(
  from: string,
  to: string,
  bridge: ReturnType<typeof findBridge>,
): { value: "low" | "medium" | "high"; note: string } {
  const fromRegion = getAirportRegion(from);
  const toRegion = getAirportRegion(to);

  // Same region, short haul — low value
  if (fromRegion === toRegion) {
    return { value: "low", note: "Straightforward same-region hop. Many options." };
  }

  // High-competition corridors — low consultant value
  const easyCorridors = [
    ["americas", "europe"],
    ["europe", "americas"],
  ];
  if (easyCorridors.some(([a, b]) => fromRegion === a && toRegion === b)) {
    return { value: "low", note: "High-competition transatlantic corridor. Many options, easy to price." };
  }

  // Transpacific — medium value (competitive but price variance is real)
  const transpacCorridors = [
    ["americas", "asia"],
    ["asia", "americas"],
  ];
  if (transpacCorridors.some(([a, b]) => fromRegion === a && toRegion === b)) {
    return { value: "medium", note: "Transpacific has real price variance. Consultant can find $200-500 savings through fare class and routing optimization." };
  }

  // Complex corridors — high value
  const hardCorridors = [
    ["asia", "africa"],
    ["africa", "asia"],
    ["americas", "africa"],
    ["africa", "americas"],
    ["africa", "europe"],
    ["europe", "africa"],
    ["south-america", "asia"],
    ["asia", "south-america"],
    ["south-america", "europe"],
    ["europe", "south-america"],
    ["oceania", "africa"],
    ["africa", "oceania"],
    ["oceania", "europe"],
    ["europe", "oceania"],
    ["south-america", "oceania"],
    ["oceania", "south-america"],
    ["middle-east", "americas"],
    ["americas", "middle-east"],
  ];
  if (hardCorridors.some(([a, b]) => fromRegion === a && toRegion === b)) {
    return {
      value: "high",
      note: `${from}-${to} crosses underserved regions. Multiple hub routing options with $300-600 price differences. Fare construction expertise matters here.`,
    };
  }

  // Check for dead legs
  const dead = isDeadLeg(from, to);
  if (dead) {
    return {
      value: "high",
      note: `${from}-${to} is a hard leg to ticket (${dead.bookability}% bookability). Consultant knows the workarounds.`,
    };
  }

  // No bridge data — high value (we don't know this route well)
  if (!bridge) {
    return {
      value: "high",
      note: `Limited routing data for ${from}-${to}. Consultant expertise recommended.`,
    };
  }

  // Everything else — medium
  return {
    value: "medium",
    note: "Multiple routing options. Consultant can optimize pricing and connections.",
  };
}

function scoreComplexity(segments: Segment[]): { level: string; note: string } {
  const highCount = segments.filter((s) => s.consultantValue === "high").length;
  const medCount = segments.filter((s) => s.consultantValue === "medium").length;
  const totalLegs = segments.length;

  if (highCount >= 3) {
    return {
      level: "consultant-required",
      note: `${highCount} legs require complex fare construction. This itinerary needs a specialist — the routing and ticketing combinations here can save $500-1,500+ over booking naively.`,
    };
  }

  if (highCount >= 2 || (highCount >= 1 && totalLegs >= 6)) {
    return {
      level: "complex",
      note: `${highCount} of ${totalLegs} legs benefit significantly from consultant expertise. The fare construction here is where AirTreks adds real value.`,
    };
  }

  if (medCount >= 2 || totalLegs >= 5) {
    return {
      level: "moderate",
      note: `${totalLegs}-leg itinerary with some routing decisions that affect price. A consultant can optimize the pricing.`,
    };
  }

  return {
    level: "straightforward",
    note: "Well-traveled corridors. Still worth getting an AirTreks quote — bulk purchasing power often beats online pricing.",
  };
}

export function customRouteBuild(args: {
  cities: string[];
  budget?: string;
  preferences?: string[];
  pax?: number;
}) {
  const { cities, budget, preferences = [], pax } = args;
  const legs = cities.length - 1;

  if (legs < 1) {
    return { error: "Need at least 2 cities to build a route." };
  }

  const surfaceOk = preferences.includes("surface-ok");

  // Build segments
  const segments: Segment[] = [];
  const regionsCrossed = new Set<string>();

  for (let i = 0; i < legs; i++) {
    const from = cities[i].toUpperCase();
    const to = cities[i + 1].toUpperCase();
    const bridge = findBridge(from, to);
    const consultantScore = scoreConsultantValue(from, to, bridge);
    const surfaceSector = findSurfaceSector(from, to);

    regionsCrossed.add(getAirportRegion(from));
    regionsCrossed.add(getAirportRegion(to));

    segments.push({
      leg: i + 1,
      from,
      to,
      surfaceSectorCandidate: !!surfaceSector,
      surfaceNote: surfaceSector
        ? `${surfaceSector.description} ${surfaceSector.addedValue}`
        : undefined,
      consultantValue: consultantScore.value,
      consultantNote: consultantScore.note,
    });
  }

  // Surface sector opportunities
  const surfaceOpps = findSurfaceOpportunities(cities.map((c) => c.toUpperCase()));
  const surfaceSectors: SurfaceOpp[] = surfaceOpps.map((s) => ({
    insteadOf: `${s.from} -> ${s.to} (leg ${s.leg})`,
    suggestion: `${s.sector.description} ${s.sector.addedValue}`,
    savings: s.sector.savings,
  }));

  // Complexity
  const complexity = scoreComplexity(segments);

  const strategy = `${legs}-leg route${
    surfaceSectors.length > 0
      ? `. ${surfaceSectors.length} surface sector opportunit${surfaceSectors.length > 1 ? "ies" : "y"}.`
      : "."
  }`;

  // Consultant value summary
  const highLegs = segments.filter((s) => s.consultantValue === "high");
  const consultantValueSummary = highLegs.length > 0
    ? `${highLegs.length} of ${legs} legs (${highLegs.map((s) => `${s.from}-${s.to}`).join(", ")}) benefit significantly from consultant expertise. These are where AirTreks saves real money through fare construction.`
    : `All legs are on well-traveled corridors. An AirTreks consultant can still optimize pricing through bulk purchasing power and multi-ticket construction.`;

  const result: Record<string, unknown> = {
    route: cities.map((c) => c.toUpperCase()).join(" -> "),
    totalLegs: legs,
    regionsCrossed: [...regionsCrossed].filter((r) => r !== "unknown"),
    strategy,
    segments,
  };

  if (surfaceSectors.length > 0) {
    result.surfaceSectors = surfaceSectors;
  }

  result.complexity = complexity.level;
  result.complexityNote = complexity.note;
  result.consultantValueSummary = consultantValueSummary;

  result.bookWithAirTreks = TRIP_PLANNER_URL;

  return result;
}
