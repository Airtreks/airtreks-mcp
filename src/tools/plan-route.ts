import { z } from "zod";
import { routeValidate } from "./route-validate.js";
import { customRouteBuild } from "./custom-route-build.js";
import { getAirportRegion } from "../data/region-bridges.js";
import { bookabilityByLegCount } from "../data/hubs.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const planRouteSchema = {
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes (e.g. ['LAX', 'NRT', 'BKK', 'LIS', 'LAX'])"),
  budget: z.enum(["budget", "mid", "premium", "business"]).optional().describe("Budget tier — affects carrier selection and fare strategy"),
  preferences: z.array(z.string()).optional().describe("Travel preferences: 'no-lcc', 'lounge-access', 'short-layovers', 'surface-ok'"),
  pax: z.number().optional().describe("Number of passengers"),
};

// Longitude approximations for direction detection
export const cityLongitudes: Record<string, number> = {
  // Americas (West)
  LAX: -118, SFO: -122, SEA: -122, YVR: -123, PDX: -123,
  DEN: -105, PHX: -112, LAS: -115, HNL: -158, ANC: -150,
  ORD: -88, DFW: -97, IAH: -95, ATL: -84, MIA: -80,
  JFK: -74, EWR: -74, BOS: -71, IAD: -77, PHL: -75,
  YYZ: -80, YUL: -74, YYC: -114,
  MEX: -99, CUN: -87, PTY: -79, GDL: -103,
  // South America
  EZE: -58, GRU: -47, SCL: -71, BOG: -74, LIM: -77, GIG: -43, MVD: -56,
  CUZ: -72, MDE: -75, UIO: -78,
  // Europe
  LHR: 0, LGW: 0, CDG: 2, AMS: 5, FRA: 9, MUC: 12, ZRH: 9,
  FCO: 12, MAD: -4, BCN: 2, LIS: -9, ATH: 24, IST: 29, MXP: 9, SVO: 37,
  CPH: 13, OSL: 11, ARN: 18, HEL: 25, VIE: 16, PRG: 14,
  WAW: 21, BUD: 19, DUB: -6, EDI: -3,
  MAN: -2, BER: 13, BRU: 4, GVA: 6, KEF: -22,
  // Middle East
  DXB: 55, DOH: 51, AUH: 55, AMM: 36, TLV: 35, JED: 39, RUH: 47,
  BAH: 50, MCT: 58,
  // Asia
  DEL: 77, BOM: 73, CCU: 89, CMB: 80, KTM: 85, MLE: 73,
  BKK: 101, DMK: 101, SGN: 107, HAN: 106, SIN: 104, KUL: 102,
  REP: 104, RGN: 96, PNH: 105, VTE: 102, CNX: 99, HKT: 98,
  HKG: 114, TPE: 121, MNL: 121, PVG: 121, PEK: 116, CAN: 113,
  NRT: 140, HND: 140, KIX: 135, ICN: 127, FUK: 130, CTS: 141,
  CGK: 107, DPS: 115, MAA: 80, BLR: 77,
  // Oceania
  SYD: 151, MEL: 145, BNE: 153, PER: 116, AKL: 175, NAN: 178,
  ADL: 138, CNS: 145, WLG: 174, CHC: 172, PPT: -149, RAR: -159, NOU: 166,
  // Africa
  JNB: 28, CPT: 18, NBO: 37, DAR: 39, ADD: 39, CMN: -8, CAI: 31,
  LOS: 3, ACC: 0, ZNZ: 39, SEZ: 55, MRU: 58, TNR: 47, DSS: -17,
  EBB: 32, KGL: 30, VFA: 26, WDH: 17,
};

function getLongitude(code: string): number | null {
  return cityLongitudes[code.toUpperCase()] ?? null;
}

function detectDirection(cities: string[]): { direction: "eastbound" | "westbound" | "mixed"; backtracking: boolean } {
  const lons: (number | null)[] = cities.map((c) => getLongitude(c.toUpperCase()));
  const validLons = lons.filter((l): l is number => l !== null);

  if (validLons.length < 3) {
    return { direction: "mixed", backtracking: false };
  }

  let eastMoves = 0;
  let westMoves = 0;
  let reversals = 0;
  let lastDirection: "east" | "west" | null = null;

  for (let i = 1; i < validLons.length; i++) {
    let diff = validLons[i] - validLons[i - 1];

    // Handle wraparound (crossing dateline)
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (Math.abs(diff) < 10) continue; // Skip small moves (same region)

    const thisDir = diff > 0 ? "east" : "west";
    if (thisDir === "east") eastMoves++;
    else westMoves++;

    if (lastDirection && thisDir !== lastDirection) reversals++;
    lastDirection = thisDir;
  }

  const backtracking = reversals >= 2;

  if (eastMoves > westMoves + 1) return { direction: "eastbound", backtracking };
  if (westMoves > eastMoves + 1) return { direction: "westbound", backtracking };
  return { direction: "mixed", backtracking };
}

function detectRegions(cities: string[]): string[] {
  const regions = new Set<string>();
  for (const city of cities) {
    const r = getAirportRegion(city.toUpperCase());
    if (r !== "unknown") regions.add(r);
  }
  return [...regions];
}

interface AllianceOption {
  alliance: string;
  viable: boolean;
  bookability: string;
  errors: string[];
  warnings: string[];
  summary: string;
}

function evaluateAlliance(cities: string[], alliance: "star" | "oneworld"): AllianceOption {
  const result = routeValidate({ cities, alliance });
  const allianceName = alliance === "star" ? "Star Alliance" : "oneworld";
  const legs = cities.length - 1;

  const legBand = bookabilityByLegCount.find((b) => {
    if (b.legs === "3-4") return legs >= 3 && legs <= 4;
    if (b.legs === "5-6") return legs >= 5 && legs <= 6;
    if (b.legs === "7+") return legs >= 7;
    return false;
  });

  const viable = result.isValid && (legBand?.successRate ?? 0) > 10;

  let summary: string;
  if (!result.isRoundTrip) {
    summary = `Not eligible — ${allianceName} RTW requires same start/end city.`;
  } else if (legs >= 7) {
    summary = `Technically possible on ${allianceName} but only ${legBand?.successRate ?? "<6"}% bookability at ${legs} legs. Custom build strongly recommended.`;
  } else if (result.errors.length > 0) {
    summary = `Has issues on ${allianceName}: ${result.errors[0]}`;
  } else if (result.warnings.length > 0) {
    summary = `Possible on ${allianceName} with caveats. ${legs} legs, ${legBand?.successRate ?? "unknown"}% bookability.`;
  } else {
    summary = `Good fit for ${allianceName} RTW. ${legs} legs, ${legBand?.successRate ?? "unknown"}% bookability.`;
  }

  return {
    alliance: allianceName,
    viable,
    bookability: legBand ? `${legBand.successRate}%` : "unknown",
    errors: result.errors,
    warnings: result.warnings,
    summary,
  };
}

export function planRoute(args: {
  cities: string[];
  budget?: string;
  preferences?: string[];
  pax?: number;
}) {
  const { cities, budget, preferences, pax } = args;
  const legs = cities.length - 1;

  if (legs < 1) {
    return { error: "Need at least 2 cities to plan a route." };
  }

  const isRoundTrip = cities[0]?.toUpperCase() === cities[cities.length - 1]?.toUpperCase();
  const { direction, backtracking } = detectDirection(cities);
  const regions = detectRegions(cities);

  // --- Evaluate all three options ---

  // 1. Star Alliance
  const starResult = evaluateAlliance(cities, "star");

  // 2. oneworld
  const owResult = evaluateAlliance(cities, "oneworld");

  // 3. Custom build (always run — this is 90% of the business)
  const customResult = customRouteBuild({ cities, budget, preferences, pax });

  // --- Determine recommendation ---

  type Approach = {
    type: "star-alliance" | "oneworld" | "custom";
    confidence: "high" | "medium" | "low";
    reason: string;
  };

  const approaches: Approach[] = [];

  // Custom is always an option
  const customComplexity = (customResult as any).complexity || "moderate";
  approaches.push({
    type: "custom",
    confidence: "high",
    reason: backtracking
      ? "Route backtracks between regions — alliance fares require continuous direction. Custom build is the only option."
      : legs >= 7
      ? `${legs} legs — alliance fares have <6% bookability. Custom build with mixed carriers is the way to go.`
      : `Custom build gives maximum flexibility — mixed carriers, LCCs for short hops, surface sectors. This is how AirTreks builds most itineraries.`,
  });

  // Alliance options (only if viable)
  if (starResult.viable && !backtracking && isRoundTrip && legs <= 6) {
    approaches.push({
      type: "star-alliance",
      confidence: legs <= 4 ? "high" : "medium",
      reason: starResult.summary,
    });
  }
  if (owResult.viable && !backtracking && isRoundTrip && legs <= 6) {
    approaches.push({
      type: "oneworld",
      confidence: legs <= 4 ? "high" : "medium",
      reason: owResult.summary,
    });
  }

  // Sort: pick the best recommendation
  // Logic: if alliance is viable with high confidence AND legs <= 4, recommend alliance first
  // Otherwise custom first (it's 90% of the business and always works)
  approaches.sort((a, b) => {
    // Alliance with high confidence and simple route goes first
    if (a.type !== "custom" && a.confidence === "high" && legs <= 4) return -1;
    if (b.type !== "custom" && b.confidence === "high" && legs <= 4) return 1;
    // Custom always beats medium-confidence alliance
    if (a.type === "custom") return -1;
    if (b.type === "custom") return 1;
    return 0;
  });

  const recommended = approaches[0];
  const alternatives = approaches.slice(1);

  // --- Build response ---

  const result: Record<string, unknown> = {
    route: cities.map((c) => c.toUpperCase()).join(" -> "),
    totalLegs: legs,
    isRoundTrip,
    direction,
    backtracking,
    regionsCrossed: regions,

    // The answer
    recommended: {
      approach: recommended.type,
      confidence: recommended.confidence,
      reason: recommended.reason,
    },
  };

  // If alliance is recommended, show the alliance details
  if (recommended.type === "star-alliance" || recommended.type === "oneworld") {
    const allianceDetail = recommended.type === "star-alliance" ? starResult : owResult;
    result.allianceDetails = {
      alliance: allianceDetail.alliance,
      bookability: allianceDetail.bookability,
      warnings: allianceDetail.warnings,
    };
    // Still include the custom build as the alternative
    result.customBuild = customResult;
  } else {
    // Custom is recommended — show the full build
    result.customBuild = customResult;
  }

  // Always show what the other options look like
  if (alternatives.length > 0) {
    result.otherOptions = alternatives.map((a) => ({
      approach: a.type,
      confidence: a.confidence,
      reason: a.reason,
    }));
  }

  // Alliance feasibility summary (always show — even if not recommended)
  if (isRoundTrip && legs >= 3) {
    result.allianceFeasibility = {
      starAlliance: {
        viable: starResult.viable,
        summary: starResult.summary,
        issues: [...starResult.errors, ...starResult.warnings],
      },
      oneworld: {
        viable: owResult.viable,
        summary: owResult.summary,
        issues: [...owResult.errors, ...owResult.warnings],
      },
    };
  }

  result.bookWithAirTreks = TRIP_PLANNER_URL;

  return result;
}
