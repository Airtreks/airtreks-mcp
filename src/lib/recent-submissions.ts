/**
 * Duplicate-submission guard for trip_idea_create.
 *
 * Apex's add-from-indie dedupes only by tp_user_trip_id, which MCP leads never
 * carry — so every retry from an AI agent would create a fresh lead in APEX.
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

export function findRecentSubmission(email: string, cities: string[]): Submission | null {
  const { email: e, route } = keyOf(email, cities);
  const store = readJson<SubmissionStore>(FILE, { submissions: [] });
  const cutoff = Date.now() - WINDOW_MS;
  return store.submissions.find((s) => s.email === e && s.route === route && Date.parse(s.at) > cutoff) || null;
}

export function recordSubmission(email: string, cities: string[], tripIdeaId: number | string) {
  const { email: e, route } = keyOf(email, cities);
  const store = readJson<SubmissionStore>(FILE, { submissions: [] });
  const cutoff = Date.now() - WINDOW_MS;
  store.submissions = store.submissions.filter((s) => Date.parse(s.at) > cutoff);
  store.submissions.push({ email: e, route, tripIdeaId, at: new Date().toISOString() });
  writeJson(FILE, store);
}
