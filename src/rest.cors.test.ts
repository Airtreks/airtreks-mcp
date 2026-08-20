import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, costsUpstream } from "./tools/registry.js";

test("only tools that reach a paid provider declare an upstream cost", () => {
  const spending = TOOLS.filter(costsUpstream).map((t) => t.name).sort();
  // route_estimate answers from recorded history and itinerary_quote_status is a
  // read of an already-paid-for job, so neither costs anything to serve.
  assert.deepEqual(spending, ["fare_quote", "itinerary_quote"]);
});

test("fare_quote is one provider search per call", () => {
  assert.equal(TOOLS.find((t) => t.name === "fare_quote")!.upstreamCost, 1);
});

test("the bundled-data tools declare no upstream cost", () => {
  for (const name of ["plan_route", "route_validate", "route_suggest", "hub_check", "fare_product_match", "custom_route_build", "route_estimate", "itinerary_quote_status"]) {
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

test("a per-call cost function is charged per call, not as one", async () => {
  const { upstreamCostOf } = await import("./tools/registry.js");
  const tool = { upstreamCost: (a: any) => (a?.cities?.length ?? 0) * 3 } as any;

  assert.equal(upstreamCostOf(tool, { cities: ["A", "B", "C"] }), 9);
  // A cost function that throws must not turn into a free call.
  assert.equal(upstreamCostOf({ upstreamCost: () => { throw new Error("x"); } } as any, {}), 1);
  // Nor may it round down to zero.
  assert.equal(upstreamCostOf({ upstreamCost: () => 0 } as any, {}), 1);
});

test("a tool with a cost function counts as spending for the CORS policy", async () => {
  const { costsUpstream } = await import("./tools/registry.js");
  assert.equal(costsUpstream({ upstreamCost: () => 5 } as any), true);
  assert.equal(costsUpstream({} as any), false);
});
