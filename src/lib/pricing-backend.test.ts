import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  setPricingBackend,
  getPricingBackend,
  forwardPricingRequest,
  type PricingBackend,
} from "./pricing-backend.js";

const stub: PricingBackend = {
  isConfigured: () => true,
  estimateRoute: async () => ({
    route: "LAX-NRT",
    cabin: "economy",
    currency: "USD",
    low: 800,
    high: 1220,
    confidence: "medium",
    premiumEconomyFallback: false,
    coverage: { priced: 1, total: 1 },
  }),
  quoteFare: async () => ({
    route: "LAX-NRT",
    cabin: "economy",
    currency: "USD",
    options: [],
    cached: false,
  }),
};

test("no backend is registered by default", () => {
  assert.equal(getPricingBackend(), null);
});

test("setPricingBackend registers and clears", () => {
  setPricingBackend(stub);
  assert.equal(getPricingBackend(), stub);
  setPricingBackend(null);
  assert.equal(getPricingBackend(), null);
});

async function withFetch<T>(
  impl: (url: string, init: any) => Promise<any>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: any, init: any) => impl(String(url), init)) as any;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("relay posts to the hosted tool endpoint and returns its JSON", async () => {
  let seenUrl = "";
  let seenBody = "";
  const out = await withFetch(
    async (url, init) => {
      seenUrl = url;
      seenBody = init.body;
      return { json: async () => ({ ok: true }) };
    },
    () => forwardPricingRequest("route_estimate", { route: ["LAX", "NRT"] }),
  );

  assert.deepEqual(out, { ok: true });
  assert.ok(seenUrl.endsWith("/api/route_estimate"), seenUrl);
  assert.deepEqual(JSON.parse(seenBody), { route: ["LAX", "NRT"] });
});

test("relay sends no API key when none is configured — pricing tools are free", async () => {
  const previous = process.env.AIRTREKS_API_KEY;
  delete process.env.AIRTREKS_API_KEY;
  try {
    let headers: Record<string, string> = {};
    await withFetch(
      async (_url, init) => {
        headers = init.headers;
        return { json: async () => ({}) };
      },
      () => forwardPricingRequest("route_estimate", {}),
    );
    assert.ok(!("X-API-Key" in headers), "must not require a key for a free tool");
  } finally {
    if (previous === undefined) delete process.env.AIRTREKS_API_KEY;
    else process.env.AIRTREKS_API_KEY = previous;
  }
});

test("relay forwards a configured API key so the caller gets their own limit", async () => {
  const previous = process.env.AIRTREKS_API_KEY;
  process.env.AIRTREKS_API_KEY = "at_test_key";
  try {
    let headers: Record<string, string> = {};
    await withFetch(
      async (_url, init) => {
        headers = init.headers;
        return { json: async () => ({}) };
      },
      () => forwardPricingRequest("route_estimate", {}),
    );
    assert.equal(headers["X-API-Key"], "at_test_key");
  } finally {
    if (previous === undefined) delete process.env.AIRTREKS_API_KEY;
    else process.env.AIRTREKS_API_KEY = previous;
  }
});

test("a transport failure returns a customer-safe message, never a throw", async () => {
  const out = await withFetch(
    async () => {
      throw new Error("ECONNREFUSED 10.0.0.5:8080");
    },
    () => forwardPricingRequest("route_estimate", {}),
  );

  assert.match(out.error, /unreachable/i);
  assert.ok(!/ECONNREFUSED|10\.0\.0\.5/.test(JSON.stringify(out)), "must not leak transport detail");
});

test("a non-JSON response returns a customer-safe message", async () => {
  const out = await withFetch(
    async () => ({
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    }),
    () => forwardPricingRequest("route_estimate", {}),
  );

  assert.equal(out.error, "The pricing service returned status 502.");
});

test("the seam names no upstream host, path, or credential", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./pricing-backend.ts", import.meta.url)),
    "utf8",
  );
  // This package is published to npm and public MCP directories (AIR-803):
  // internal system knowledge belongs in the private hosted repo only.
  for (const forbidden of ["itinerary-engine", "itinerary_engine", "/api/v1/", "amadeus"]) {
    assert.ok(
      !src.toLowerCase().includes(forbidden.toLowerCase()),
      `pricing-backend.ts must not mention "${forbidden}"`,
    );
  }
});
