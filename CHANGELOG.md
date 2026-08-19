# Changelog

## 1.0.3 — 2026-08-19

First npm release carrying the AIR-786 lead-submission overhaul. Everything below has been live on mcp.airtreks.com; this release brings the `npx airtreks-mcp` (stdio) distribution up to date.

### trip_idea_create
- Leads land in APEX under the new **"Airtreks MCP"** origination, classified Online Form, assigned to the default agent, with the agent notified.
- **Required before submission** (validated in one pass, with a helpful error): customer name, valid email, 2+ cities as 3-letter IATA codes, an ISO departure date for **every** leg.
- **Planning questionnaire**: the same questions as the Trip Planner form, fetched live from APEX (never hardcoded — edits in TP admin apply without a redeploy). Call once without `questionsAnswers` to receive the current questions and options; resubmit with answers keyed by question name. A JSON-string form of `questionsAnswers` is also accepted (stale-schema clients).
- **Auto-solutions**: qualifying leads (automation answer, economy, <3 pax, dates 4+ days out) get solutions priced and emailed automatically; the response reports `autoSolutionsSent`.
- **`viewTripUrl`**: the response includes a magic link that signs the customer straight into their AirTreks trip page.
- **Dedupe**: the same email + route within 24h returns the existing trip idea instead of creating a duplicate.
- Auth to APEX via `APEX_API_KEY` (modern `atk_` key) preferred over the legacy bearer token.

### Fixes
- Multi-passenger submissions no longer crash APEX (placeholder companions removed; the passenger count rides on `passengers_number`).
- Start/end cities are no longer duplicated in the APEX date list — this also fixes the "Amadeus 925 overlapping segment" auto-pricing failures.
- **stdio mode works without root**: the data store now falls back to `~/.airtreks-mcp/` when `/data` (the hosted volume path) isn't creatable — previously `npx airtreks-mcp` crashed at startup with EACCES.

### Packaging
- Explicit `files` whitelist (`dist`, `server.json`) — deterministic tarball, no stray repo files.
- `prepublishOnly` runs the build and test suite, so a publish can't ship stale or broken output.

## 1.0.2 — 2026-07-13

- Version used for the Official MCP Registry listing (remotes + icons in `server.json`); npm itself stayed on 1.0.1.

## 1.0.1 — 2026-06

- Initial public release: 6 free routing tools + key-gated `trip_idea_create`, Streamable HTTP + stdio transports.
