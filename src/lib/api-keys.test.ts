import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// api-keys.js writes to /data (Railway volume) at import time — point it at a
// temp dir before the module graph loads.
process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "airtreks-mcp-test-"));
const { registerKey, lookupKey, revokeKey, revokeKeysByEmail, listKeys, apiKeyFromRequest } = await import("./api-keys.js");

test("revokeKey disables an existing key", () => {
  const key = registerKey("revoke-one@example.com", "Revoke One");
  assert.ok(lookupKey(key.key));
  assert.equal(revokeKey(key.key), true);
  assert.equal(lookupKey(key.key), null);
  // record is kept, just disabled
  const record = listKeys().find((k) => k.key === key.key);
  assert.equal(record?.enabled, false);
});

test("revokeKey returns false for an unknown key", () => {
  assert.equal(revokeKey("at_does_not_exist"), false);
});

test("revokeKeysByEmail revokes the enabled key and reports the count", () => {
  const key = registerKey("revoke-email@example.com", "Revoke Email");
  assert.equal(revokeKeysByEmail("revoke-email@example.com"), 1);
  assert.equal(lookupKey(key.key), null);
});

test("revokeKeysByEmail returns 0 when no enabled key matches", () => {
  assert.equal(revokeKeysByEmail("nobody@example.com"), 0);
  // already-revoked keys don't count again
  registerKey("revoke-twice@example.com", "Twice");
  assert.equal(revokeKeysByEmail("revoke-twice@example.com"), 1);
  assert.equal(revokeKeysByEmail("revoke-twice@example.com"), 0);
});

test("apiKeyFromRequest prefers the header, falls back to ?key=", () => {
  const u = (q = "") => new URL(`https://mcp.airtreks.com/mcp${q}`);
  assert.equal(apiKeyFromRequest({ "x-api-key": "at_header" }, u("?key=at_url")), "at_header");
  assert.equal(apiKeyFromRequest({}, u("?key=at_url")), "at_url");
  assert.equal(apiKeyFromRequest({ "x-api-key": "  " }, u("?key=at_url")), "at_url");
  assert.equal(apiKeyFromRequest({}, u()), "");
});
