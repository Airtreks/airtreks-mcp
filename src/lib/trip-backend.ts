/**
 * The seam between the public MCP package and AirTreks' internal systems
 * (AIR-803).
 *
 * The public package ships with NO backend registered: trip_idea_create
 * forwards the whole call to the hosted API at mcp.airtreks.com, which runs
 * the full submission pipeline server-side. The hosted deployment (private
 * repo) injects a real TripBackend via setTripBackend() at startup, which
 * switches the tool to run the pipeline locally.
 */

export interface TpQuestion {
  name: string;
  question: string;
  options: string[];
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
  /** Question text -> [answer], the backend wire format. */
  questionsAnswers?: Record<string, string[]>;
}

export interface TripBackend {
  /** Whether the backend has credentials to submit trip requests. */
  isConfigured(): boolean;
  /** Create the trip request; returns its id and the raw backend response. */
  createTripIdea(opts: CreateTripIdeaOpts): Promise<{ id: number | string; raw: any }>;
  /** The live planning questionnaire (uncached; tp-questions.ts caches). */
  getPlanningQuestions(): Promise<TpQuestion[]>;
  /** Auto-login link into the customer's trip page; null when unavailable. */
  getTripLink(tripRequestId: number | string): Promise<string | null>;
}

let backend: TripBackend | null = null;

/** Called by the hosted deployment at startup, before the server starts. */
export function setTripBackend(b: TripBackend | null) {
  backend = b;
}

export function getTripBackend(): TripBackend | null {
  return backend;
}

const HOSTED_API = process.env.AIRTREKS_API_URL || "https://mcp.airtreks.com";

/**
 * Public-package mode: relay the tool call to the hosted API, which runs the
 * full pipeline (validation, questionnaire, dedupe, submission, trip link).
 * Requires the caller's own AirTreks API key (the same key remote MCP users
 * send as X-API-Key), provided via AIRTREKS_API_KEY.
 */
export async function forwardTripRequest(args: unknown): Promise<any> {
  const key = process.env.AIRTREKS_API_KEY || "";
  if (!key) {
    return {
      error: "Submitting a trip request from a local install requires an AirTreks API key.",
      register: `Get one with: POST ${HOSTED_API}/register {"email": "you@example.com"}`,
      hint: "Set the AIRTREKS_API_KEY environment variable and try again.",
    };
  }

  try {
    const res = await fetch(`${HOSTED_API}/api/trip_idea_create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify(args ?? {}),
    });
    try {
      return await res.json();
    } catch {
      return { error: `The trip service returned status ${res.status}.` };
    }
  } catch {
    return { error: "The trip service is unreachable right now. Please try again shortly." };
  }
}
