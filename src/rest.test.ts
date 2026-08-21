import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// rest.js pulls in api-keys.js, whose store writes to /data (Railway volume)
// at import time — point it at a temp dir before the module graph loads.
process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "airtreks-mcp-test-"));
const { buildOpenApiDoc, executeRestTool } = await import("./rest.js");
const { TOOLS } = await import("./tools/registry.js");

test("openapi doc lists every tool plus /register", () => {
  const doc: any = buildOpenApiDoc();
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.servers[0].url, "https://mcp.airtreks.com");
  for (const tool of TOOLS) {
    assert.ok(doc.paths[`/api/${tool.name}`]?.post, `missing path for ${tool.name}`);
  }
  assert.ok(doc.paths["/register"]?.post);
});

test("openapi request schemas come from the zod shapes", () => {
  const doc: any = buildOpenApiDoc();
  const schema = doc.paths["/api/route_validate"].post.requestBody.content["application/json"].schema;
  assert.ok(schema.properties.cities);
  assert.ok(schema.required.includes("cities"));
  assert.ok(!("$schema" in schema));
});

test("openapi marks every tool public, trip_idea_create included", () => {
  const doc: any = buildOpenApiDoc();
  const op = doc.paths["/api/trip_idea_create"].post;
  assert.deepEqual(op.security, []);
  assert.ok(!op.responses["401"]);
  assert.deepEqual(doc.paths["/api/plan_route"].post.security, []);
});

test("executeRestTool runs a free tool and returns raw JSON", async () => {
  const result = await executeRestTool("route_validate", { cities: ["LAX", "NRT", "BKK", "LAX"] }, false);
  assert.equal(result.status, 200);
  assert.equal(typeof (result.body as any).isValid, "boolean");
});

test("executeRestTool normalizes metro codes like the MCP transport", async () => {
  const result = await executeRestTool("hub_check", { from: "TYO", to: "LON" }, false);
  assert.equal(result.status, 200);
});

test("executeRestTool 404s unknown tools with the available list", async () => {
  const result = await executeRestTool("nope", {}, false);
  assert.equal(result.status, 404);
  assert.ok((result.body as any).available.includes("/api/plan_route"));
});

test("executeRestTool 400s invalid arguments with field-level issues", async () => {
  const result = await executeRestTool("route_validate", { cities: "LAX" }, false);
  assert.equal(result.status, 400);
  const issues = (result.body as any).issues;
  assert.ok(issues.some((i: any) => i.path === "cities"));
});

// The handoff is no longer key-gated, so an unkeyed call has to reach argument
// validation instead of being turned away at the door. These args are
// deliberately incomplete: the 400 proves the gate is gone without the test
// reaching the trip backend.
test("executeRestTool lets trip_idea_create through without an API key", async () => {
  const result = await executeRestTool("trip_idea_create", { email: "a@b.com", cities: ["LAX", "NRT", "LAX"] }, false);
  assert.notEqual(result.status, 401);
  assert.equal(result.status, 400);
  const issues = (result.body as any).issues;
  assert.ok(issues.some((i: any) => i.path === "name"));
  assert.ok(issues.some((i: any) => i.path === "dates"));
});
