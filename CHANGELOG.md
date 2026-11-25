# Changelog

## Unreleased

From the Grok test of 1.2.9 (AIR-1391).

### trip_idea_create
- **Duplicate check no longer drops changes.** It matched on email and route only, so a traveler who changed dates, passengers or cabin and resubmitted got the old lead back and lost the change. It now matches on email, route, dates, passengers and cabin. A true duplicate says `created: false` and that nothing from the call was saved.
- A call that is missing details returns `status: "needs_input"` and `created: false`. The `questionsAnswers` text says to leave it out on the first call, and what to do when the traveler picks "Date flexibility".
- The reply's next-steps no longer promise carrier recommendations.

### Routing and pricing tools
- `fare_product_match` no longer assumes the route goes one direction when the caller does not say. It works it out from the cities and reports how (`directionBasis`). A Pacific out-and-back is no longer called a classic round-the-world fare.
- `custom_route_build` no longer says it gives carrier recommendations (it stopped in 1.2.8).
- `route_estimate`, `fare_quote` and `itinerary_quote` say when they priced economy or one adult because none was given.
- A raw supplier line such as "Amadeus error 866: NO FARE FOUND" is replaced with plain words and a next step.

## 1.2.9 — 2026-11-25

### trip_idea_create
- **No invented dates:** new required `datesGivenByTraveler`. A request is rejected unless the agent confirms the traveler gave the dates, and dates must be real calendar dates in travel order. The consultant notes record that the dates came from the traveler.

### Carriers
- Spirit Airlines removed (ceased operations 2026-05-02); Southwest bags are no longer listed as free.

## 1.2.8 — 2026-11-03

### trip_idea_create
- **No silent defaults:** `passengers` and `cabin` are required. The traveler's planning answers, passengers and cabin go into the consultant notes, and an automation preference is acknowledged in the reply.
- **A complete lead:** tool text tells agents to ask the traveler for everything (name, email, cities, a date for every leg, passengers, cabin, planning answers) and never to invent dates or answers.
- **No airline picks in the lead:** carrier and alliance recommendations are no longer sent to the consultant.
- Field length limits, a strict single-address email, and newlines flattened in free text.

### Routing tools
- `plan_route` and `custom_route_build` no longer choose airlines or alliances. They return route facts (direction, regions, backtracking, surface-sector options, complexity). Use `route_estimate` for price.

### Security
- Dependency advisories cleared (`npm audit`: 0 vulnerabilities).
- Per-caller cap on paid upstream searches; a malformed budget setting no longer disables the daily ceiling.
- Atomic JSON writes; a corrupt data file is moved aside instead of overwritten, and a corrupt spend ledger fails closed.
- `/register` is closed unless a secret is configured, rate limited, and size capped; secrets are compared in constant time.
- REST request bodies are capped at 64KB.

### Build
- The Docker build no longer runs the `prepare` script before the source is copied.

## 1.1.1 — 2026-08-19

- Build now cleans `dist/` first: the 1.1.0 tarball shipped stale, unreferenced compiled files from pre-1.1.0 builds (tsc never deletes outputs of removed modules). 1.1.0 is unpublished; this is the same code with a clean artifact.

## 1.1.0 — 2026-08-19

- **Structural split (AIR-803):** the public package no longer talks to AirTreks' internal systems. `trip_idea_create` on a local (stdio/npx) install now relays the request to the hosted API at mcp.airtreks.com using your AirTreks API key (`AIRTREKS_API_KEY`, from `POST https://mcp.airtreks.com/register`). The hosted deployment injects its own backend via the new `TripBackend` seam (`setTripBackend`). Behavior, tool names, and schemas are unchanged for all users.
- Local installs no longer need any server-side credentials; the previous `APEX_*` variables are gone from this package.

## 1.0.3 — 2026-08-19

First npm release carrying the AIR-786 lead-submission overhaul. Everything below has been live on mcp.airtreks.com; this release brings the `npx airtreks-mcp` (stdio) distribution up to date.

### trip_idea_create
- Trip requests reach AirTreks under their own **"Airtreks MCP"** source, assigned to the default travel consultant, with the consultant notified.
- **Required before submission** (validated in one pass, with a helpful error): customer name, valid email, 2+ cities as 3-letter IATA codes, an ISO departure date for **every** leg.
- **Planning questionnaire**: the same questions as the Trip Planner form, fetched live from AirTreks (never hardcoded — edits in TP admin apply without a redeploy). Call once without `questionsAnswers` to receive the current questions and options; resubmit with answers keyed by question name. A JSON-string form of `questionsAnswers` is also accepted (stale-schema clients).
- **Auto-solutions**: qualifying leads (automation answer, economy, <3 pax, dates 4+ days out) get solutions priced and emailed automatically; the response reports `autoSolutionsSent`.
- **`viewTripUrl`**: the response includes a magic link that signs the customer straight into their AirTreks trip page.
- **Dedupe**: the same email + route within 24h returns the existing trip idea instead of creating a duplicate.
- Server-side auth to AirTreks via `APEX_API_KEY` preferred over the legacy bearer token.

### Fixes
- Multi-passenger submissions no longer fail server-side (placeholder companions removed; the passenger count rides on `passengers_number`).
- Start/end cities are no longer duplicated in the submitted itinerary — this also fixes auto-pricing failures on every multi-stop trip.
- **stdio mode works without root**: the data store now falls back to `~/.airtreks-mcp/` when `/data` (the hosted volume path) isn't creatable — previously `npx airtreks-mcp` crashed at startup with EACCES.

### Packaging
- Explicit `files` whitelist (`dist`, `server.json`) — deterministic tarball, no stray repo files.
- `prepublishOnly` runs the build and test suite, so a publish can't ship stale or broken output.

## 1.0.2 — 2026-07-13

- Version used for the Official MCP Registry listing (remotes + icons in `server.json`); npm itself stayed on 1.0.1.

## 1.0.1 — 2026-06

- Initial public release: 6 free routing tools + key-gated `trip_idea_create`, Streamable HTTP + stdio transports.
