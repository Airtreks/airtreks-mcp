import { z } from "zod";
import { findBridge, getAirportRegion, type BridgeCarrier } from "../data/region-bridges.js";
import { findSurfaceSector, findSurfaceOpportunities } from "../data/surface-sectors.js";
import { isDeadLeg } from "../data/hubs.js";
import { findCarrier } from "../data/alliances.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const customRouteBuildSchema = {
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes (e.g. ['LAX', 'NRT', 'BKK', 'CMB', 'NBO', 'LIS', 'LAX'])"),
  budget: z.enum(["budget", "mid", "premium", "business"]).optional().describe("Budget tier: 'budget' prioritizes LCCs, 'business' prioritizes J-class product quality"),
  preferences: z.array(z.string()).optional().describe("Preferences: 'no-lcc', 'lounge-access', 'short-layovers', 'surface-ok'"),
  pax: z.number().optional().describe("Number of passengers"),
};

interface SegmentCarrier {
  code: string;
  name: string;
  type: string;
  alliance?: string;
  why: string;
}

interface Alternative {
  code: string;
  name: string;
  type: string;
  why: string;
  tradeoff: string;
}

interface Segment {
  leg: number;
  from: string;
  to: string;
  carrier: SegmentCarrier;
  alternatives: Alternative[];
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

function pickCarriersForLeg(
  from: string,
  to: string,
  budget?: string,
  noLcc?: boolean,
): { primary: SegmentCarrier; alternatives: Alternative[] } {
  const bridge = findBridge(from, to);
  const fromRegion = getAirportRegion(from);
  const toRegion = getAirportRegion(to);
  const sameRegion = fromRegion === toRegion;

  // Default fallback
  const fallback: SegmentCarrier = {
    code: "??",
    name: "Consultant recommendation needed",
    type: "flag-carrier",
    why: `No carrier data for ${from}-${to}. An AirTreks consultant will find the best option.`,
  };

  if (!bridge) {
    return { primary: fallback, alternatives: [] };
  }

  // Filter by budget preference
  let candidates = [...bridge.carriers];

  if (noLcc) {
    candidates = candidates.filter((c) => c.type !== "lcc");
  }

  if (budget === "budget") {
    // Prioritize: budget tier first, then primary
    candidates.sort((a, b) => {
      const tierOrder: Record<string, number> = { budget: 0, primary: 1, alternative: 2 };
      return (tierOrder[a.tier] ?? 2) - (tierOrder[b.tier] ?? 2);
    });
  } else if (budget === "business" || budget === "premium") {
    // Filter out LCCs, prioritize primary full-service
    candidates = candidates.filter((c) => c.type !== "lcc");
    candidates.sort((a, b) => {
      const tierOrder: Record<string, number> = { primary: 0, alternative: 1, budget: 2 };
      return (tierOrder[a.tier] ?? 2) - (tierOrder[b.tier] ?? 2);
    });
  } else {
    // Mid or default — primary first
    candidates.sort((a, b) => {
      const tierOrder: Record<string, number> = { primary: 0, alternative: 1, budget: 2 };
      return (tierOrder[a.tier] ?? 2) - (tierOrder[b.tier] ?? 2);
    });
  }

  if (candidates.length === 0) {
    return { primary: fallback, alternatives: [] };
  }

  const top = candidates[0];
  const allianceInfo = findCarrier(top.code);

  const primary: SegmentCarrier = {
    code: top.code,
    name: top.name,
    type: top.type === "lcc" ? "lcc" : top.type === "connecting" ? "gulf-bridge" : allianceInfo ? "alliance" : "flag-carrier",
    alliance: allianceInfo?.alliance.name || top.via ? undefined : undefined,
    why: top.why,
  };

  // Add alliance info if available
  if (allianceInfo) {
    primary.alliance = allianceInfo.alliance.name;
    primary.type = "alliance";
  }

  // Gulf bridge carriers keep their type
  if (["EK", "QR", "EY", "TK"].includes(top.code) && top.via) {
    primary.type = "gulf-bridge";
  }

  // LCCs keep their type
  if (top.type === "lcc" || top.tier === "budget") {
    primary.type = "lcc";
  }

  const alternatives: Alternative[] = candidates.slice(1, 4).map((c) => {
    let type = "flag-carrier";
    const ai = findCarrier(c.code);
    if (ai) type = "alliance";
    if (["EK", "QR", "EY", "TK"].includes(c.code) && c.via) type = "gulf-bridge";
    if (c.type === "lcc" || c.tier === "budget") type = "lcc";

    return {
      code: c.code,
      name: c.name,
      type,
      why: c.why,
      tradeoff: c.tier === "budget"
        ? "Budget option — no frills but significantly cheaper"
        : c.tier === "alternative"
        ? "Viable alternative — compare pricing"
        : "Premium option",
    };
  });

  return { primary, alternatives };
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
    return { value: "medium", note: "Transpacific has multiple carrier options. Consultant can find $200-500 savings through fare class and routing optimization." };
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

  // Check for dead legs on alliance fares
  const dead = isDeadLeg(from, to);
  if (dead) {
    return {
      value: "high",
      note: `${from}-${to} is a dead leg on alliance fares (${dead.bookability}% bookability). Consultant knows the workarounds.`,
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
  const unknownCarriers = segments.filter((s) => s.carrier.code === "??").length;

  if (unknownCarriers > 0 || highCount >= 3) {
    return {
      level: "consultant-required",
      note: `${highCount} legs require complex fare construction. This itinerary needs a specialist — the routing and ticketing combinations here can save $500-1,500+ over booking naively.`,
    };
  }

  if (highCount >= 2 || (highCount >= 1 && totalLegs >= 6)) {
    return {
      level: "complex",
      note: `${highCount} of ${totalLegs} legs benefit significantly from consultant expertise. The carrier mixing and fare construction here is where AirTreks adds real value.`,
    };
  }

  if (medCount >= 2 || totalLegs >= 5) {
    return {
      level: "moderate",
      note: `${totalLegs}-leg itinerary with some routing decisions that affect price. A consultant can optimize the carrier mix.`,
    };
  }

  return {
    level: "straightforward",
    note: "Well-traveled corridors with clear carrier choices. Still worth getting an AirTreks quote — bulk purchasing power often beats online pricing.",
  };
}

function checkAllianceEligibility(cities: string[]): string | null {
  const legs = cities.length - 1;
  const isRoundTrip = cities[0]?.toUpperCase() === cities[cities.length - 1]?.toUpperCase();

  if (!isRoundTrip) return null;
  if (legs > 6) return null; // 7+ legs have <6% bookability
  if (legs < 3) return null;

  return `This route could also work as an alliance RTW fare (${legs} legs, round trip). Use route_validate to check Star Alliance or oneworld feasibility — alliance fares are sometimes cheaper than custom builds for 3-6 leg round trips.`;
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

  const noLcc = preferences.includes("no-lcc") || budget === "premium" || budget === "business";
  const surfaceOk = preferences.includes("surface-ok");

  // Build segments
  const segments: Segment[] = [];
  const regionsCrossed = new Set<string>();

  for (let i = 0; i < legs; i++) {
    const from = cities[i].toUpperCase();
    const to = cities[i + 1].toUpperCase();
    const bridge = findBridge(from, to);
    const { primary, alternatives } = pickCarriersForLeg(from, to, budget, noLcc);
    const consultantScore = scoreConsultantValue(from, to, bridge);
    const surfaceSector = findSurfaceSector(from, to);

    regionsCrossed.add(getAirportRegion(from));
    regionsCrossed.add(getAirportRegion(to));

    segments.push({
      leg: i + 1,
      from,
      to,
      carrier: primary,
      alternatives,
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

  // Strategy summary
  const carrierTypes = new Set(segments.map((s) => s.carrier.type));
  const typeDescriptions: string[] = [];
  if (carrierTypes.has("alliance")) typeDescriptions.push("alliance carriers");
  if (carrierTypes.has("gulf-bridge")) typeDescriptions.push("Gulf bridge connections");
  if (carrierTypes.has("lcc")) typeDescriptions.push("LCCs for short hops");
  if (carrierTypes.has("regional")) typeDescriptions.push("regional specialists");
  if (carrierTypes.has("flag-carrier")) typeDescriptions.push("flag carriers");

  const strategy = `Mixed-carrier build using ${typeDescriptions.join(", ")}${
    surfaceSectors.length > 0
      ? `. ${surfaceSectors.length} surface sector opportunit${surfaceSectors.length > 1 ? "ies" : "y"}.`
      : "."
  }`;

  // Consultant value summary
  const highLegs = segments.filter((s) => s.consultantValue === "high");
  const consultantValueSummary = highLegs.length > 0
    ? `${highLegs.length} of ${legs} legs (${highLegs.map((s) => `${s.from}-${s.to}`).join(", ")}) benefit significantly from consultant expertise. These are where AirTreks saves real money through fare construction and carrier knowledge.`
    : `All legs are on well-traveled corridors. An AirTreks consultant can still optimize pricing through bulk purchasing power and multi-ticket construction.`;

  // Alliance eligibility check
  const allianceNote = checkAllianceEligibility(cities);

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

  if (allianceNote) {
    result.allianceFareNote = allianceNote;
  }

  result.bookWithAirTreks = TRIP_PLANNER_URL;

  return result;
}
