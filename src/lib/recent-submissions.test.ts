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
