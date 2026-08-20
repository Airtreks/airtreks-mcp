/**
 * API key management.
 * Keys stored in /data/api-keys.json (persistent volume).
 *
 * Registration requires REGISTER_SECRET to prevent spam.
 * Each key gets a daily rate limit (default 100).
 */

import { randomBytes } from "node:crypto";
import { readJson, writeJson } from "./store.js";

export interface ApiKey {
  key: string;
  email: string;
  name: string;
  created: string;
  tier: "free" | "pro" | "partner";
  dailyLimit: number;
  enabled: boolean;
}

interface KeyStore {
  keys: ApiKey[];
}

let store: KeyStore = { keys: [] };

function load() {
  store = readJson<KeyStore>("api-keys.json", { keys: [] });
}

function save() {
  writeJson("api-keys.json", store);
}

// Load on import
load();

export function generateKey(): string {
  return "at_" + randomBytes(24).toString("hex");
}

export function registerKey(email: string, name: string): ApiKey {
  load(); // re-read in case of concurrent writes
  const existing = store.keys.find((k) => k.email === email && k.enabled);
  if (existing) return existing;

  const key: ApiKey = {
    key: generateKey(),
    email,
    name,
    created: new Date().toISOString(),
    tier: "free",
    dailyLimit: 100,
    enabled: true,
  };
  store.keys.push(key);
  save();
  return key;
}

/**
 * The API key presented by a request: the X-API-Key header, or a ?key=
 * query parameter. Hosted clients that can't set headers on an MCP endpoint
 * — notably claude.ai connectors — can only pass it in the URL.
 */
export function apiKeyFromRequest(headers: Record<string, unknown>, url: URL): string {
  const header = headers["x-api-key"];
  if (typeof header === "string" && header.trim() !== "") return header.trim();
  return (url.searchParams.get("key") || "").trim();
}

export function lookupKey(key: string): ApiKey | null {
  load();
  return store.keys.find((k) => k.key === key && k.enabled) || null;
}

export function listKeys(): ApiKey[] {
  load();
  return store.keys;
}

export function revokeKey(key: string): boolean {
  load();
  const found = store.keys.find((k) => k.key === key);
  if (!found) return false;
  found.enabled = false;
  save();
  return true;
}

export function revokeKeysByEmail(email: string): number {
  load();
  const matches = store.keys.filter((k) => k.email === email && k.enabled);
  for (const k of matches) k.enabled = false;
  if (matches.length) save();
  return matches.length;
}
