# MCP Directory Submissions

## Metadata pack (canonical - copy from here, never retype)

| Field | Value |
|-------|-------|
| Name | AirTreks MCP (`io.github.SEKeener/airtreks-mcp`) |
| One-sentence description | Multi-city flight routing intelligence — plan RTW trips, validate alliances, get carrier picks. |
| Long description | Complex multi-city flight routing intelligence for AI agents, with real prices. 10 tools: plan round-the-world trips across 60+ carriers, validate Star Alliance and oneworld routings, get segment-by-segment carrier recommendations, identify surface sector savings, price a route from AirTreks fare history, quote live fares for a specific itinerary, price a whole multi-stop trip across several tickets, and hand off to human consultants. No API key needed (100 req/day free). |
| Tool list | Routing: `plan_route`, `route_validate`, `route_suggest`, `hub_check`, `fare_product_match`, `custom_route_build`. Pricing: `route_estimate`, `fare_quote`, `itinerary_quote`, `itinerary_quote_status`. All ten free; `trip_idea_create` needs an API key. |
| Transport | Streamable HTTP at `https://mcp.airtreks.com/mcp`; stdio via `npx airtreks-mcp` |
| Auth model | Free tier: none, 100 req/day per IP. API key (for `trip_idea_create` + higher limits): `POST https://mcp.airtreks.com/register` |
| Repo | https://github.com/Airtreks/airtreks-mcp — note the MCP Registry namespace is still `io.github.SEKeener/airtreks-mcp`, and `server.json` keeps the old URL to match it. Changing the namespace registers a *different* server rather than renaming this one, so it needs a deliberate decision plus a publish from that GitHub identity. The old URL 301-redirects, so nothing is broken. |
| Homepage | https://airtreks.com (server: https://mcp.airtreks.com) |
| Icon (PNG 512, light) | https://airtreks.com/brand/airtreks-icon-512.png |
| Icon (PNG 512, dark) | https://airtreks.com/brand/airtreks-icon-dark-512.png |
| Icon (SVG, light) | https://airtreks.com/brand/airtreks-icon.svg |
| Icon (SVG, dark) | https://airtreks.com/brand/airtreks-icon-dark.svg |
| Manifest | https://mcp.airtreks.com/.well-known/mcp/server.json |
| Contact | sean@airtreks.com |

Icon URLs are the canonical brand set from AIR-479 (`airtreks-media-v3:packages/brand/brand-assets.md`). Use the 512 PNG wherever a directory asks for a logo; SVG where accepted.

Claude Desktop / Cursor config snippet (remote, recommended):

```json
{
  "mcpServers": {
    "airtreks": {
      "url": "https://mcp.airtreks.com/mcp"
    }
  }
}
```

Local stdio alternative:

```json
{
  "mcpServers": {
    "airtreks": {
      "command": "npx",
      "args": ["airtreks-mcp"]
    }
  }
}
```

## Status

| Directory | Status | Link |
|-----------|--------|------|
| awesome-mcp-servers (punkpeye) | PR submitted (open) | https://github.com/punkpeye/awesome-mcp-servers/pull/7293 |
| Official MCP Registry | Published 2026-07-13 (v1.0.2, remotes + icons) | https://registry.modelcontextprotocol.io/v0/servers?search=airtreks |
| npm | Published v1.1.1 (2026-08-19; 1.1.0 unpublished — shipped stale internal files; 1.0.x = pre-AIR-786) | https://www.npmjs.com/package/airtreks-mcp |
| mcp.so | Needs GitHub login to submit | https://mcp.so/submit |
| mcpservers.org | Submitted 2026-06-25, pending review | https://mcpservers.org/submit |
| PulseMCP | Auto-ingests from Official MCP Registry | https://www.pulsemcp.com |
| Glama.ai | Listed (auto-indexed, 27 downloads) | https://glama.ai/mcp/servers?search=airtreks |
| OpenAI ChatGPT Apps | Prereqs done (AIR-499); awaiting Sean: org verification + portal submission | https://platform.openai.com/plugins |

---

## OpenAI ChatGPT Apps directory — https://platform.openai.com/plugins (AIR-499)

Server-side prereqs are done: tool annotations (AIR-482), privacy policy at
https://mcp.airtreks.com/privacy, and an `openai` egress rate-limit bucket seeded
from https://openai.com/chatgpt-connectors.json and refreshed daily at runtime
(AIR-499). Free tier is anonymous and touches no user data, so no OAuth is
required (OpenAI allows noauth for such tools).

Sean-interactive steps, in order:

1. **Verify the org** at https://platform.openai.com/settings — complete *business*
   verification to publish as AirTreks (individual verification publishes under
   your personal name). Reviews reject unverified publishers.
2. Confirm you have `api.apps.write` (org owners have it automatically).
3. At https://platform.openai.com/plugins create a submission:
   - MCP server URL: `https://mcp.airtreks.com/mcp` (no auth credentials needed)
   - Click **Scan Tools** — it should find all 11 tools (10 free + `trip_idea_create`) with annotations
   - Fill metadata from the canonical pack at the top of this doc (name, logo
     512 PNG, descriptions, privacy URL `https://mcp.airtreks.com/privacy`)
   - Country availability: all countries
   - No UI screenshots (server has no Apps SDK UI components)
4. Test prompts with expected responses (the review runs these; copy as-is):
   - "Plan a round-the-world trip from San Francisco through Tokyo, Bangkok, and London" — `plan_route` returns an ordered itinerary with carrier recommendations per segment, alliance feasibility, and surface-sector suggestions. It returns **no price**; pricing is a separate set of tools.
   - "Is SFO-NRT-BKK-LHR-SFO valid as a Star Alliance RTW routing?" — `route_validate` returns a validity verdict with rule-by-rule reasoning.
   - "Suggest a 4-stop round-the-world routing through Asia and Europe on Star Alliance" — `route_suggest` returns up to 3 proven routing templates with bookability ratings.
   - "What's the best connection between Portland and Tokyo?" — `hub_check` returns the best hub routing with proven carrier combinations (flags dead legs if any).
   - "Roughly what does LAX to Tokyo to Bangkok to London and back cost?" — `route_estimate` returns a per-person USD range from AirTreks fare history in under a second, labelled as a range from past bookings rather than a live quote.
   - "What are the actual fares LAX to Tokyo on 12 November 2026?" — `fare_quote` returns live fares with flight numbers, stops and duration, stating that availability and price can change before booking. Takes up to about 40 seconds.
   - "Price the whole trip LAX, Tokyo, Bangkok, London, LAX for those dates" — `itinerary_quote` returns a `quoteReference` immediately with `status: "pending"`, then `itinerary_quote_status` returns several ways to ticket the trip. **This is expected two-step behaviour, not a failure** — pricing a multi-stop trip takes about a minute, which is why it is asynchronous.

   Note for the reviewer-facing description: the pricing tools return real prices, including
   per-itinerary totals. Earlier copy for this listing said the server never returns a
   per-itinerary price. That is no longer true and the wording above supersedes it.
5. Submit for review. Timeline ~1-2 weeks. Common rejections: connection
   failures, failed test prompts, annotation mismatches, undisclosed user data.
6. After approval, hit **Publish** in the portal; the app becomes searchable in
   the ChatGPT apps directory.

---

## Official MCP Registry

Published 2026-07-13 as `io.github.SEKeener/airtreks-mcp` v1.0.2 (isLatest, active) with the streamable-http remote and the 4 canonical icons. To publish a new version: bump `version` in `server.json` (registry rejects duplicates), then `mcp-publisher login github && mcp-publisher publish` from the repo root.

---

## mcp.so — https://mcp.so/submit

- **Type:** MCP Server
- **Name:** AirTreks MCP
- **URL:** https://github.com/Airtreks/airtreks-mcp
- **Server Config:**
```json
{
  "mcpServers": {
    "airtreks": {
      "url": "https://mcp.airtreks.com/mcp"
    }
  }
}
```

---

## mcpservers.org — https://mcpservers.org/submit

- **Server Name:** AirTreks MCP
- **Short Description:** Complex multi-city flight routing intelligence for AI agents, with real prices. 10 tools: plan round-the-world trips across 60+ carriers, validate Star Alliance and oneworld routings, get segment-by-segment carrier recommendations, identify surface sector savings, price a route from AirTreks fare history, quote live fares for a specific itinerary, price a whole multi-stop trip across several tickets, and hand off to human consultants. No API key needed (100 req/day free).
- **Link:** https://github.com/Airtreks/airtreks-mcp
- **Category:** Other (or Finance if no Travel option)
- **Contact Email:** sean@airtreks.com

---

## PulseMCP — https://www.pulsemcp.com/submit

- **URL:** https://github.com/Airtreks/airtreks-mcp
- (PulseMCP auto-enriches from the GitHub repo README)

---

## Glama.ai — https://glama.ai/mcp/servers

Click "Add Server" and paste:
- **GitHub URL:** https://github.com/Airtreks/airtreks-mcp

---

## Notes

- All directories allow editing after submission
- mcpservers.org has a $39 premium option for faster approval + badge (optional)
- Glama auto-indexes from GitHub — may already discover us
- PulseMCP auto-enriches metadata from GitHub
