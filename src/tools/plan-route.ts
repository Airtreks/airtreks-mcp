import { z } from "zod";
import { customRouteBuild } from "./custom-route-build.js";
import { getAirportRegion } from "../data/region-bridges.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const planRouteSchema = {
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes (e.g. ['LAX', 'NRT', 'BKK', 'LIS', 'LAX'])"),
  budget: z.enum(["budget", "mid", "premium", "business"]).optional().describe("Budget tier the traveler asked for"),
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

  const customResult = customRouteBuild({ cities, budget, preferences, pax });

  // --- Build response ---

  const result: Record<string, unknown> = {
    route: cities.map((c) => c.toUpperCase()).join(" -> "),
    totalLegs: legs,
    isRoundTrip,
    direction,
    backtracking,
    regionsCrossed: regions,

  };

  result.customBuild = customResult;

  result.bookWithAirTreks = TRIP_PLANNER_URL;

  return result;
}
