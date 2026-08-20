import { test } from "node:test";
import assert from "node:assert/strict";
import { findAirportChanges } from "./airport-changes.js";
import { sameCityDifferentAirport, METRO_AREAS } from "../data/metro-airports.js";

const flight = (from: string, to: string, arrivesAt?: string, departsAt?: string) => ({
  from,
  to,
  arrivesAt,
  departsAt,
});

test("the reported case is detected: arrive DMK, depart BKK", () => {
  // Sean's report: an itinerary arrived Don Mueang and left Suvarnabhumi with
  // nothing saying so.
  const changes = findAirportChanges([
    flight("SYD", "DMK", "2027-01-18 06:00"),
    flight("BKK", "LHR", undefined, "2027-01-22 09:00"),
  ]);

  assert.equal(changes.length, 1);
  assert.equal(changes[0].city, "Bangkok");
  assert.equal(changes[0].arriveAt, "Don Mueang (DMK)");
  assert.equal(changes[0].departFrom, "Suvarnabhumi (BKK)");
  assert.equal(changes[0].approxKm, 50);
});

test("the warning is graded by the slack available, not fired uniformly", () => {
  // Four days is a non-event; four hours strands someone. Warning identically on
  // both is how people learn to ignore warnings.
  const comfortable = findAirportChanges([
    flight("SYD", "DMK", "2027-01-18 06:00"),
    flight("BKK", "LHR", undefined, "2027-01-22 09:00"),
  ])[0];
  const sameDay = findAirportChanges([
    flight("SYD", "DMK", "2027-01-18 06:00"),
    flight("BKK", "LHR", undefined, "2027-01-18 18:00"),
  ])[0];
  const tight = findAirportChanges([
    flight("SYD", "DMK", "2027-01-18 06:00"),
    flight("BKK", "LHR", undefined, "2027-01-18 08:30"),
  ])[0];

  assert.equal(comfortable.urgency, "comfortable");
  assert.match(comfortable.note, /plenty of time/i);

  assert.equal(sameDay.urgency, "same-day");
  assert.match(sameDay.note, /same-day transfer/i);

  assert.equal(tight.urgency, "tight");
  assert.match(tight.note, /risk of missing/i);
  assert.ok(tight.hoursBetween !== undefined && tight.hoursBetween < 4);
});

test("a missing time says to check rather than guessing", () => {
  const change = findAirportChanges([flight("SYD", "DMK"), flight("BKK", "LHR")])[0];
  assert.equal(change.urgency, "unknown");
  assert.match(change.note, /check how much time/i);
  assert.equal(change.hoursBetween, undefined);
});

test("an open jaw is not a problem and must not be flagged", () => {
  // Arrive London, leave Paris. The customer asked for that.
  assert.deepEqual(findAirportChanges([flight("JFK", "LHR"), flight("CDG", "JFK")]), []);
});

test("a normal connection through the same airport is silent", () => {
  assert.deepEqual(findAirportChanges([flight("LAX", "NRT"), flight("NRT", "BKK")]), []);
});

test("unknown airports are left alone rather than guessed at", () => {
  assert.deepEqual(findAirportChanges([flight("AAA", "BBB"), flight("CCC", "DDD")]), []);
});

test("several changes in one itinerary are all reported, in order", () => {
  const changes = findAirportChanges([
    flight("SIN", "DMK", "2027-03-01 08:00"),
    flight("BKK", "HND", "2027-03-05 20:00", "2027-03-05 12:00"),
    flight("NRT", "LAX", undefined, "2027-03-06 10:00"),
  ]);
  assert.deepEqual(changes.map((c) => c.city), ["Bangkok", "Tokyo"]);
});

test("sameCityDifferentAirport is symmetric and rejects same-airport", () => {
  assert.ok(sameCityDifferentAirport("DMK", "BKK"));
  assert.ok(sameCityDifferentAirport("BKK", "DMK"));
  assert.equal(sameCityDifferentAirport("BKK", "BKK"), null);
  assert.equal(sameCityDifferentAirport("LHR", "CDG"), null, "different cities");
});

test("no airport code appears in two different metro areas", () => {
  // A duplicated code would make sameCity answers depend on table order.
  const seen = new Map<string, string>();
  for (const area of METRO_AREAS) {
    for (const a of area.airports) {
      assert.equal(seen.get(a.code), undefined, `${a.code} listed under ${seen.get(a.code)} and ${area.city}`);
      seen.set(a.code, area.city);
    }
  }
});

test("every metro area has at least two airports", () => {
  // A single-airport city cannot produce the problem, so listing it is noise.
  for (const area of METRO_AREAS) {
    assert.ok(area.airports.length >= 2, `${area.city} has only one airport listed`);
    assert.ok(area.spanKm > 0, `${area.city} needs a span`);
  }
});
