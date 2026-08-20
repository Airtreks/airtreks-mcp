/**
 * Daily ceiling on paid upstream searches (AIR-807 M4).
 *
 * The pricing tools are free and unauthenticated, and each call to one of them
 * spends a real provider search. Per-caller rate limits bound how much any one
 * client can do; nothing bounds the total. This does.
 *
 * Persisted, deliberately. It lives on the Railway volume at DATA_DIR because an
 * in-memory counter resets on every deploy — and deploys are frequent, so the
 * budget would quietly reset several times a day and cap nothing.
 *
 * Counted in upstream searches rather than tool calls, because that is the unit
 * that costs money: one fare quote is a single search, while a multi-stop
 * itinerary quote fans out into many.
 */

import { readJson, writeJson } from "./store.js";

const FILE = "spend-ledger.json";

/** 0 disables the ceiling. */
const DAILY_BUDGET = parseInt(process.env.UPSTREAM_DAILY_BUDGET || "2000", 10);

interface Ledger {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  /** Upstream searches spent on that day. */
  spent: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): Ledger {
  const ledger = readJson<Ledger>(FILE, { day: today(), spent: 0 });
  // A ledger from a previous day is a fresh budget, not a carried-over one.
  if (ledger.day !== today()) return { day: today(), spent: 0 };
  return ledger;
}

export interface SpendVerdict {
  allowed: boolean;
  spent: number;
  budget: number;
  remaining: number;
}

/** Current state without charging anything. */
export function peekSpend(): SpendVerdict {
  const { spent } = load();
  return {
    allowed: DAILY_BUDGET <= 0 || spent < DAILY_BUDGET,
    spent,
    budget: DAILY_BUDGET,
    remaining: DAILY_BUDGET <= 0 ? Infinity : Math.max(0, DAILY_BUDGET - spent),
  };
}

/**
 * Charge `units` searches against today's budget.
 *
 * Charges up front, before the upstream call, so a burst of concurrent requests
 * cannot all pass a check and then collectively overspend. The trade-off is that
 * a failed upstream call still consumes budget — which is the right way round:
 * a failed provider search is usually still a billable one.
 */
export function chargeSpend(units: number): SpendVerdict {
  if (DAILY_BUDGET <= 0) {
    return { allowed: true, spent: 0, budget: 0, remaining: Infinity };
  }

  const ledger = load();
  if (ledger.spent >= DAILY_BUDGET) {
    return { allowed: false, spent: ledger.spent, budget: DAILY_BUDGET, remaining: 0 };
  }

  const next = { day: ledger.day, spent: ledger.spent + Math.max(1, Math.trunc(units)) };
  try {
    writeJson(FILE, next);
  } catch {
    // If the volume is unwritable, fail CLOSED: an uncountable spend is worse
    // than a refused request. This is the one place in the server where that is
    // the right call — everywhere else degrades to a non-priced answer.
    return { allowed: false, spent: ledger.spent, budget: DAILY_BUDGET, remaining: 0 };
  }

  return {
    allowed: true,
    spent: next.spent,
    budget: DAILY_BUDGET,
    remaining: Math.max(0, DAILY_BUDGET - next.spent),
  };
}

/** Test seam. */
export function _resetLedgerForTests(spent = 0): void {
  writeJson(FILE, { day: today(), spent });
}
