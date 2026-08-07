import { z } from "zod";
import { findHubConnection, isDeadLeg, hubRules, hubConnections } from "../data/hubs.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const hubCheckSchema = {
  from: z.string().describe("Origin IATA airport code (e.g. 'SYD')"),
  to: z.string().describe("Destination IATA airport code (e.g. 'JFK')"),
  alliance: z.string().optional().describe("Preferred alliance: 'star' or 'oneworld'"),
};

export function hubCheck(args: { from: string; to: string; alliance?: string }) {
  const from = args.from.toUpperCase();
  const to = args.to.toUpperCase();

  const dead = isDeadLeg(from, to);
  const connection = findHubConnection(from, to);

  // Find relevant hub rules
  const relevantRules = hubRules.filter((rule) =>
    rule.deadLegs.some((dl) => dl.from === from && dl.to === to) ||
    rule.deadLegs.some((dl) => dl.from === to && dl.to === from)
  );

  // Find any connections involving these airports
  const relatedConnections = hubConnections.filter(
    (h) => h.from === from || h.to === from || h.from === to || h.to === to
  );

  const result: Record<string, unknown> = {
    query: `${from} → ${to}`,
  };

  if (dead) {
    result.isDead = true;
    result.deadLeg = {
      carrier: dead.carrier,
      bookability: `${dead.bookability}%`,
      samples: dead.samples,
    };
    if (relevantRules.length > 0) {
      result.rule = relevantRules[0].description;
      result.fixes = relevantRules[0].fixes;
    }
  } else {
    result.isDead = false;
  }

  if (connection) {
    result.recommendedRouting = {
      via: connection.via.length > 0 ? connection.via : ["Direct"],
      carriers: connection.carriers,
      notes: connection.notes,
    };
  } else if (!dead) {
    result.recommendedRouting = {
      note: `No specific hub data for ${from}-${to}. This may work as a direct segment — validate with route_validate for the full itinerary.`,
    };
  }

  if (relatedConnections.length > 0 && !connection) {
    result.relatedConnections = relatedConnections.slice(0, 3).map((h) => ({
      route: `${h.from} → ${h.via.length > 0 ? h.via.join(" → ") + " → " : ""}${h.to}`,
      carriers: h.carriers,
      notes: h.notes,
    }));
  }

  // Surface sector suggestion
  result.surfaceSectorTip =
    "If these cities are close enough to travel overland, a surface sector (fly into one, out of the other) can save a flight leg and reduce cost.";
  result.bookWithAirTreks = TRIP_PLANNER_URL;

  return result;
}
