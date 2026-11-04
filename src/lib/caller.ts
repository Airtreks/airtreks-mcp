/**
 * Who is making the current request, so the spend ledger can cap one caller
 * (AIR-1311). The global daily budget alone lets one anonymous caller use it
 * all up for everyone: a 12-city itinerary_quote costs ~115 searches, so ~18
 * calls would empty a 2,000-search day.
 *
 * AsyncLocalStorage rather than a parameter because tool functions take only
 * their arguments, and both transports call them the same way.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ key: string }>();

/** Run `fn` with `key` (the rate-limit bucket or session) as the caller. */
export function runAsCaller<T>(key: string, fn: () => T): T {
  return store.run({ key }, fn);
}

export function currentCaller(): string | undefined {
  return store.getStore()?.key;
}

const num = (v: string | undefined, d: number) => {
  const n = parseInt(v || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/**
 * Daily upstream searches one caller may spend. Shared AI-platform pools hold
 * many people, so they get the most room; a single conversation or IP the least.
 */
export function callerSpendLimit(key: string): number {
  if (key.startsWith("platform:")) return num(process.env.CALLER_SPEND_PLATFORM, 1000);
  if (key.startsWith("ip:") || key.startsWith("sess:")) return num(process.env.CALLER_SPEND_ANON, 150);
  return num(process.env.CALLER_SPEND_KEYED, 500);
}
