import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRIP_PLANNER_URL } from "./links.js";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// AIR-785: https://www.airtreks.com/trip-planner/ 404s. The TripPlanner is on
// its own host. Every tool used to hardcode the dead path.
const DEAD_PATH = "airtreks.com/trip-planner";

test("TRIP_PLANNER_URL points at the TripPlanner host, not the airtreks.com path", () => {
  assert.equal(TRIP_PLANNER_URL, "https://tripplanner.airtreks.com/");
  assert.ok(!TRIP_PLANNER_URL.includes(DEAD_PATH));
});

test("no tool hardcodes a TripPlanner URL", () => {
  const dir = join(SRC, "tools");
  const offenders: string[] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const body = readFileSync(join(dir, file), "utf8");
    // Strip comments so a documented counter-example does not trip the check.
    // The line-comment pattern deliberately ignores "//" preceded by ":" — a
    // naive /\/\/.*$/ swallows the "//" in "https://" and hides the very
    // literal this test exists to catch.
    const code = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    if (code.includes(DEAD_PATH) || code.includes("tripplanner.airtreks.com")) {
      offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these tools hardcode a TripPlanner URL instead of importing TRIP_PLANNER_URL: ${offenders.join(", ")}`,
  );
});

test("every tool that hands back a booking link uses the shared constant", () => {
  const dir = join(SRC, "tools");
  const withLink = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes("bookWithAirTreks"));

  assert.ok(withLink.length > 0, "expected at least one tool to return bookWithAirTreks");

  for (const file of withLink) {
    const body = readFileSync(join(dir, file), "utf8");
    assert.ok(
      body.includes("TRIP_PLANNER_URL"),
      `${file} returns bookWithAirTreks but does not use TRIP_PLANNER_URL`,
    );
  }
});
