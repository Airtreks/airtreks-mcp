/**
 * The Trip Planner planning questionnaire (confidence / guidance / priority...),
 * fetched through the injected TripBackend (Trip Planner is the source of
 * truth — editable in TP admin, no MCP redeploy needed).
 *
 * Cached on the persistent volume with a 6h TTL, stale-if-error: a fetch
 * failure serves the last-known questions, and with no cache at all the
 * questionnaire requirement is skipped — lead creation must never be blocked
 * on this endpoint.
 */

import { readJson, writeJson } from "./store.js";
import { getTripBackend, type TpQuestion } from "./trip-backend.js";

export type { TpQuestion };

const FILE = "tp-questions.json";
const TTL_MS = 6 * 3600 * 1000;

interface QuestionsCache {
  fetchedAt: string;
  questions: TpQuestion[];
}

export async function getQuestionsCached(): Promise<TpQuestion[]> {
  const cache = readJson<QuestionsCache>(FILE, { fetchedAt: "", questions: [] });
  const fresh = cache.fetchedAt && Date.now() - Date.parse(cache.fetchedAt) < TTL_MS;
  if (fresh) return cache.questions;

  try {
    const questions = (await getTripBackend()?.getPlanningQuestions()) ?? [];
    if (questions.length) {
      writeJson(FILE, { fetchedAt: new Date().toISOString(), questions });
      return questions;
    }
  } catch {
    // stale-if-error: fall through to whatever we had
  }
  return cache.questions;
}
