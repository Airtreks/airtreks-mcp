import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// store.js writes to /data (Railway volume) at import time — point it at a
// temp dir before the module graph loads.
process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "airtreks-mcp-test-"));
const { findRecentSubmission, recordSubmission } = await import("./recent-submissions.js");

test("recordSubmission makes the trip findable, keyed case-insensitively", () => {
  recordSubmission("Traveler@Example.com", ["lax", "NRT", "LAX"], 4242);
  const hit = findRecentSubmission("traveler@example.com", ["LAX", "nrt", "lax"]);
  assert.equal(hit?.tripIdeaId, 4242);
});

test("a different route for the same email is not a duplicate", () => {
  recordSubmission("routes@example.com", ["LAX", "NRT", "LAX"], 1);
  assert.equal(findRecentSubmission("routes@example.com", ["LAX", "BKK", "LAX"]), null);
});

test("a different email for the same route is not a duplicate", () => {
  recordSubmission("first@example.com", ["JFK", "LHR", "JFK"], 2);
  assert.equal(findRecentSubmission("second@example.com", ["JFK", "LHR", "JFK"]), null);
});

// AIR-1391: the guard is for retries, not for a changed request.
const { detailOf } = await import("./recent-submissions.js");

test("the same details are a retry and return the existing trip", () => {
  const d = detailOf(["2027-02-01", "2027-02-10"], 2, "business");
  recordSubmission("retry@example.com", ["PDX", "LAX", "PDX"], 10, d);
  assert.equal(findRecentSubmission("retry@example.com", ["PDX", "LAX", "PDX"], d)?.tripIdeaId, 10);
});

test("different dates, passengers or cabin are a new request, not a duplicate", () => {
  const d = detailOf(["2027-02-01", "2027-02-10"], 2, "business");
  recordSubmission("changed@example.com", ["PDX", "LAX", "PDX"], 11, d);
  const route = ["PDX", "LAX", "PDX"];
  assert.equal(findRecentSubmission("changed@example.com", route, detailOf(["2027-03-08", "2027-03-15"], 2, "business")), null);
  assert.equal(findRecentSubmission("changed@example.com", route, detailOf(["2027-02-01", "2027-02-10"], 3, "business")), null);
  assert.equal(findRecentSubmission("changed@example.com", route, detailOf(["2027-02-01", "2027-02-10"], 2, "economy")), null);
});

test("an entry saved before details were recorded still matches on email and route", () => {
  recordSubmission("legacy@example.com", ["SFO", "NRT", "SFO"], 12);
  assert.equal(findRecentSubmission("legacy@example.com", ["SFO", "NRT", "SFO"], detailOf(["2027-01-01", "2027-01-09"], 1, "economy"))?.tripIdeaId, 12);
});
