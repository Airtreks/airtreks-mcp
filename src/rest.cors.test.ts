import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, costsUpstream } from "./tools/registry.js";

test("only tools that reach a paid provider declare an upstream cost", () => {
  const spending = TOOLS.filter(costsUpstream).map((t) => t.name).sort();
  // route_estimate answers from recorded history, so it costs nothing to serve.
  assert.deepEqual(spending, ["fare_quote"]);
});

test("fare_quote is one provider search per call", () => {
  assert.equal(TOOLS.find((t) => t.name === "fare_quote")!.upstreamCost, 1);
});

test("the bundled-data tools declare no upstream cost", () => {
  for (const name of ["plan_route", "route_validate", "route_suggest", "hub_check", "fare_product_match", "custom_route_build", "route_estimate"]) {
    const tool = TOOLS.find((t) => t.name === name)!;
    assert.ok(!costsUpstream(tool), `${name} must not be marked as spending`);
  }
});

test("adding a spending tool cannot silently inherit wildcard CORS", async () => {
  // Dispatch is a dynamic lookup over TOOLS, so the guard has to be derived from
  // the ToolDef rather than a hardcoded list of paths.
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./rest.ts", import.meta.url), "utf8"),
  );
  assert.match(src, /costsUpstream/, "the CORS policy must be derived from the registry");
  assert.ok(
    !/res\.writeHead\(\s*result\.status,\s*\{[^}]*\.\.\.CORS_HEADERS/.test(src),
    "the tool response must use the per-tool policy, not the wildcard block",
  );
});
