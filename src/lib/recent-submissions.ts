/**
 * Duplicate-submission guard for trip_idea_create.
 *
 * The trip backend has no dedupe for requests submitted this way — every
 * retry from an AI agent would create a fresh trip request.
 * Remember recent submissions (email + route) on the persistent volume and
 * reuse the existing trip idea id inside the window.
 */

import { readJson, writeJson } from "./store.js";

const FILE = "trip-idea-submissions.json";
const WINDOW_MS = 24 * 3600 * 1000;

export interface Submission {
  email: string;
  route: string;
  tripIdeaId: number | string;
  at: string; // ISO timestamp
  /** dates, passengers and cabin (AIR-1391). Absent on entries written before it existed: those match on email + route only. */
  detail?: string;
}

interface SubmissionStore {
  submissions: Submission[];
}

function keyOf(email: string, cities: string[]): { email: string; route: string } {
  return {
    email: email.trim().toLowerCase(),
    route: cities.map((c) => c.trim().toUpperCase()).join("-"),
  };
}

/** What distinguishes a changed request from a retry of the same one. */
export function detailOf(dates: string[] | undefined, passengers: number, cabin: string): string {
  return `${(dates ?? []).map((d) => d.trim()).join(",")}|${passengers}|${cabin}`;
}

export function findRecentSubmission(email: string, cities: string[], detail?: string): Submission | null {
  const { email: e, route } = keyOf(email, cities);
  const store = readJson<SubmissionStore>(FILE, { submissions: [] });
  const cutoff = Date.now() - WINDOW_MS;
  return store.submissions.find((s) => s.email === e && s.route === route && Date.parse(s.at) > cutoff
    && (detail === undefined || s.detail === undefined || s.detail === detail)) || null;
}

export function recordSubmission(email: string, cities: string[], tripIdeaId: number | string, detail?: string) {
  const { email: e, route } = keyOf(email, cities);
  const store = readJson<SubmissionStore>(FILE, { submissions: [] });
  const cutoff = Date.now() - WINDOW_MS;
  store.submissions = store.submissions.filter((s) => Date.parse(s.at) > cutoff);
  store.submissions.push({ email: e, route, tripIdeaId, at: new Date().toISOString(), detail });
  writeJson(FILE, store);
}
