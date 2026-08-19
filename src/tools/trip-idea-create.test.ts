import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "airtreks-mcp-test-"));
const { tripIdeaCreate } = await import("./trip-idea-create.js");
const { recordSubmission } = await import("../lib/recent-submissions.js");

test("reports every missing required field in one pass", async () => {
  const result = await tripIdeaCreate({ email: "not-an-email", name: "  ", cities: ["LAX"], dates: [] });
  assert.ok(result.error);
  assert.match(result.error!, /valid customer email/);
  assert.match(result.error!, /full name/);
  assert.match(result.error!, /at least 2 cities/);
  assert.match(result.error!, /departure date/);
});

test("rejects city names that are not IATA codes", async () => {
  const result = await tripIdeaCreate({
    email: "iata@example.com",
    name: "Iata Traveler",
    cities: ["San Francisco", "NRT"],
    dates: ["2026-11-10"],
  });
  assert.match(result.error!, /3-letter IATA codes/);
});

test("rejects non-ISO dates", async () => {
  const result = await tripIdeaCreate({
    email: "dates@example.com",
    name: "Date Traveler",
    cities: ["SFO", "NRT"],
    dates: ["2026-11-10", "Nov 24"],
  });
  assert.match(result.error!, /ISO format/);
});

test("a recently submitted email+route returns the existing trip idea instead of creating a new one", async () => {
  recordSubmission("dupe@example.com", ["SFO", "SYD", "SFO"], 777);
  const result = await tripIdeaCreate({
    email: "dupe@example.com",
    name: "Dupe Traveler",
    cities: ["SFO", "SYD", "SFO"],
    dates: ["2026-11-10", "2026-11-24"],
  });
  assert.equal(result.success, true);
  assert.equal((result as any).duplicate, true);
  assert.equal(result.tripIdeaId, 777);
});
