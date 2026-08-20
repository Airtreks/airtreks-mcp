/**
 * Spot where an itinerary lands at one airport and leaves from another in the
 * same city (AIR-811).
 *
 * A multi-stop trip can arrive Bangkok Don Mueang and depart Bangkok
 * Suvarnabhumi — 50 km apart, no airside connection, bags to collect. With four
 * days in between it is a non-event; with four hours it strands someone. So the
 * warning is graded by the slack actually available rather than fired uniformly:
 * an identical warning on both teaches people to ignore it.
 */

import { sameCityDifferentAirport } from "../data/metro-airports.js";
import type { QuotedFlight } from "./pricing-backend.js";

export type ChangeUrgency = "tight" | "same-day" | "comfortable" | "unknown";

export interface AirportChange {
  city: string;
  /** e.g. "Don Mueang (DMK)" */
  arriveAt: string;
  /** e.g. "Suvarnabhumi (BKK)" */
  departFrom: string;
  approxKm: number;
  hoursBetween?: number;
  urgency: ChangeUrgency;
  /** Ready to show a customer. */
  note: string;
}

/**
 * Parse the upstream's "YYYY-MM-DD HH:MM" (time optional) as UTC.
 *
 * Deliberately not local-time or timezone-aware: we do not know either airport's
 * offset, so a gap computed here is approximate. It is used only to pick a
 * wording band, and the bands are hours wide — but it is why the note says
 * "about" and why a missing time downgrades to "unknown" rather than guessing.
 */
function parseWhen(value?: string): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  if (hh === undefined) return null; // date only — cannot judge slack
  return Date.UTC(+y, +mo - 1, +d, +hh, +mm);
}

function describe(a: { name: string; code: string }): string {
  return `${a.name} (${a.code})`;
}

function gradeAndNote(
  city: string,
  from: { name: string; code: string },
  to: { name: string; code: string },
  approxKm: number,
  hours: number | null,
): { urgency: ChangeUrgency; note: string } {
  const move = `You arrive ${city} at ${describe(from)} and leave from ${describe(to)} — different airports about ${approxKm} km apart, with no connection inside security.`;

  if (hours === null) {
    return {
      urgency: "unknown",
      note: `${move} Check how much time there is between the two flights before booking.`,
    };
  }
  const rounded = Math.round(hours);
  if (hours < 4) {
    return {
      urgency: "tight",
      note: `${move} There are only about ${rounded} hours between the flights, which is not enough to collect bags and cross the city with any margin. Treat this as a real risk of missing the second flight.`,
    };
  }
  if (hours < 24) {
    return {
      urgency: "same-day",
      note: `${move} About ${rounded} hours between the flights, so it is doable, but it means a same-day transfer across the city rather than an airport connection.`,
    };
  }
  const days = Math.round(hours / 24);
  return {
    urgency: "comfortable",
    note: `${move} You have about ${days} day${days === 1 ? "" : "s"} here, so there is plenty of time — just note the two flights use different airports.`,
  };
}

/**
 * Every same-city airport change across a sequence of flights, in order.
 *
 * Pass the whole itinerary's flights flattened in travel order — including
 * across separate tickets, which is where this most often arises, since tickets
 * are chosen independently and nothing makes them agree on an airport.
 */
export function findAirportChanges(flights: QuotedFlight[]): AirportChange[] {
  const out: AirportChange[] = [];

  for (let i = 0; i < flights.length - 1; i++) {
    const arrive = flights[i];
    const depart = flights[i + 1];
    const pair = sameCityDifferentAirport(arrive.to, depart.from);
    if (!pair) continue;

    const arrivedAt = parseWhen(arrive.arrivesAt);
    const departsAt = parseWhen(depart.departsAt);
    const hours =
      arrivedAt !== null && departsAt !== null && departsAt > arrivedAt
        ? (departsAt - arrivedAt) / 3_600_000
        : null;

    const { urgency, note } = gradeAndNote(pair.city, pair.from, pair.to, pair.spanKm, hours);
    out.push({
      city: pair.city,
      arriveAt: describe(pair.from),
      departFrom: describe(pair.to),
      approxKm: pair.spanKm,
      hoursBetween: hours === null ? undefined : Math.round(hours * 10) / 10,
      urgency,
      note,
    });
  }

  return out;
}
