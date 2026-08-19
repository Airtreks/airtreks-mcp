# Changelog

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
