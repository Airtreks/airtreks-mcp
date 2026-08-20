/**
 * Platform egress ranges for AI connector directories.
 * All of a platform's users share a handful of egress IPs, so per-IP
 * limits would starve them; give each platform one shared daily bucket.
 */

import { OPENAI_EGRESS_SNAPSHOT } from "./openai-egress-snapshot.js";

export interface PlatformRange {
  name: string;
  cidrs: string[];
  dailyLimit: number;
}

/**
 * Per-conversation ceiling for traffic arriving on a shared platform bucket.
 *
 * The shared pool exists because a platform's users all egress from a handful of
 * IPs, so per-IP limits would starve them. The cost is that one heavy caller can
 * drain the pool for everyone else behind the same range. Charging each MCP
 * session its own smaller share bounds that: the realistic failure is an agent
 * stuck in a retry loop inside one conversation, and this stops that
 * conversation taking the whole day's pool with it.
 *
 * It is a bound, not a defence — session ids are free to mint, so a determined
 * caller can rotate them. The spend ledger is what actually caps cost.
 */
export const PLATFORM_SESSION_DAILY_LIMIT = parseInt(
  process.env.PLATFORM_SESSION_DAILY_LIMIT || "250",
  10,
);

// Anthropic egress for Claude connectors: https://claude.com/docs (160.79.104.0/21)
// OpenAI egress for ChatGPT apps/connectors rotates; seeded from a snapshot and
// refreshed live via refreshOpenAIRanges().
export const PLATFORM_RANGES: PlatformRange[] = [
  { name: "anthropic", cidrs: ["160.79.104.0/21"], dailyLimit: parseInt(process.env.ANTHROPIC_DAILY_LIMIT || "5000", 10) },
  { name: "openai", cidrs: OPENAI_EGRESS_SNAPSHOT, dailyLimit: parseInt(process.env.OPENAI_DAILY_LIMIT || "5000", 10) },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255 || p !== String(n)) return null;
    out = out * 256 + n;
  }
  return out;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  // Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4); other IPv6 never matches our v4 ranges
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(v4);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

export function matchPlatform(ip: string): PlatformRange | null {
  for (const range of PLATFORM_RANGES) {
    if (range.cidrs.some((cidr) => ipInCidr(ip, cidr))) return range;
  }
  return null;
}

export const OPENAI_EGRESS_URL = "https://openai.com/chatgpt-connectors.json";

const CIDR_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;

/** Extract valid IPv4 CIDRs from a chatgpt-connectors.json body. */
export function parseEgressPrefixes(body: unknown): string[] {
  const prefixes = (body as { prefixes?: unknown })?.prefixes;
  if (!Array.isArray(prefixes)) return [];
  return prefixes
    .map((p) => (p as { ipv4Prefix?: unknown })?.ipv4Prefix)
    .filter((c): c is string => typeof c === "string" && CIDR_RE.test(c));
}

/**
 * Replace the openai bucket's CIDRs with the live published list. OpenAI
 * rotates these ranges, so call at boot and daily. Never throws; on any
 * failure the current (snapshot or last-fetched) list stays in place.
 */
export async function refreshOpenAIRanges(): Promise<void> {
  try {
    const res = await fetch(OPENAI_EGRESS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cidrs = parseEgressPrefixes(await res.json());
    if (cidrs.length === 0) throw new Error("no valid prefixes in response");
    const openai = PLATFORM_RANGES.find((r) => r.name === "openai");
    if (openai) openai.cidrs = cidrs;
    console.log(`Refreshed OpenAI egress ranges: ${cidrs.length} prefixes`);
  } catch (err) {
    console.error(`OpenAI egress refresh failed, keeping current list: ${err}`);
  }
}
