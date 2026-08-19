/**
 * APEX API client for the MCP server.
 * Ported from airtreks-rtw/server/lib/kite-client.js.
 *
 * Env vars:
 *   APEX_API_URL       — https://kite.bootsnall.com/api (default)
 *   APEX_API_KEY       — Apex-issued API key ("atk_…", AIR-505); preferred.
 *                        Mint it restricted to api/tripideas/add-from-indie only.
 *   APEX_CLIENT_ID     — OAuth client ID (legacy)
 *   APEX_CLIENT_SECRET — OAuth client secret (legacy)
 *   APEX_BEARER_TOKEN  — Pre-generated bearer token (legacy, skips OAuth)
 */

const APEX_API_URL = process.env.APEX_API_URL || "https://kite.bootsnall.com/api";
const API_KEY = process.env.APEX_API_KEY || "";
const CLIENT_ID = process.env.APEX_CLIENT_ID || "";
const CLIENT_SECRET = process.env.APEX_CLIENT_SECRET || "";

let cachedToken: string | null = process.env.APEX_BEARER_TOKEN || null;
let tokenExpiry = cachedToken ? Date.now() + 365 * 24 * 3600 * 1000 : 0;

export function isConfigured(): boolean {
  return !!(API_KEY || cachedToken || (CLIENT_ID && CLIENT_SECRET));
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (!CLIENT_ID || !CLIENT_SECRET) return null;

  const oauthUrl = APEX_API_URL.replace("/api", "") + "/oauth/token";

  const res = await fetch(oauthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`APEX OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

async function post(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (API_KEY) {
    headers["X-Api-Key"] = API_KEY;
  } else {
    const token = await getToken();
    if (!token) throw new Error("APEX API not configured — set APEX_API_KEY or APEX_BEARER_TOKEN or APEX_CLIENT_ID/SECRET");
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${APEX_API_URL}${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`APEX API error (${res.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

export interface TpQuestion {
  name: string;
  question: string;
  options: string[];
}

/** The Trip Planner questionnaire, proxied by APEX's pre-existing api/tpquestions/list. */
export async function getTpQuestions(): Promise<TpQuestion[]> {
  const result = await post("/tpquestions/list", {});
  const list = Array.isArray(result) ? result : [];
  return list
    .filter((q: any) => q?.name && q?.question)
    .map((q: any) => ({
      name: String(q.name),
      question: String(q.question),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    }));
}

export interface CreateTripIdeaOpts {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  stops: string[];
  dates?: string[];
  passengers?: number;
  cabin?: string;
  notes?: string;
  flexibleDates?: boolean;
  /** Question text -> [answer], the add-from-indie questions_answers format. */
  questionsAnswers?: Record<string, string[]>;
}

/** Exported for tests — the add-from-indie payload, pure of any network. */
export function buildTripIdeaPayload(opts: CreateTripIdeaOpts): Record<string, unknown> {
  const {
    firstName = "",
    lastName = "",
    email,
    phone = "",
    stops,
    dates = [],
    passengers = 1,
    cabin = "economy",
    notes = "",
    questionsAnswers,
  } = opts;

  // APEX composes the route as startcity + citylist + endcity
  // (TripIdea::getLeadFromIndieData), so citylist carries ONLY the
  // intermediate stops — including the first/last here duplicates them in the
  // date list and creates a start->start segment that pricing rejects
  // (Amadeus 925 "overlapping origin/destination").
  const citylist = [];
  for (let i = 1; i < stops.length - 1; i++) {
    citylist.push({ city: stops[i], departure_date: dates[i] || null });
  }

  const serviceclass = cabin === "business" ? 2 : 1;
  const route = stops.join("-");

  const payload: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    start_date: dates[0] || null,
    end_date: dates[dates.length - 1] || null,
    passengers_number: passengers,
    startcity: stops[0],
    endcity: stops[stops.length - 1],
    citylist,
    serviceclass,
    notes,
    route,
    origin: "airtreks-mcp",
    ref: "",
    source: 0,
    // Only the primary passenger — APEX derives pax_no from passengers_number,
    // and placeholder companions crash the insert (people.last_name is NOT NULL
    // and Laravel nulls empty strings). Consultants add real names later.
    passengers: [{ first_name: firstName, last_name: lastName, gender: "" }],
  };

  if (questionsAnswers && Object.keys(questionsAnswers).length) {
    payload.questions_answers = questionsAnswers;
  }

  return payload;
}

export async function createTripIdea(opts: CreateTripIdeaOpts): Promise<{ id: number | string; raw: any }> {
  const result = await post("/tripideas/add-from-indie", buildTripIdeaPayload(opts));
  const id = result.data?.trip_idea?.id || result.data?.[0] || result.id;
  return { id, raw: result };
}
