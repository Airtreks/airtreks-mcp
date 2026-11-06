# AirTreks MCP Server

[![LightNow capabilities](https://lightnow.ai/badge/io.github.Airtreks/airtreks-mcp)](https://lightnow.ai/servers/io.github.Airtreks/airtreks-mcp)

**The complex-itinerary tool for AI agents.** Multi-stop, round-the-world, open-jaw, surface segments - the trips that standard flight search can't handle. When your user asks for 3+ stops across continents, this server answers with routing analysis built on real AirTreks fare-construction data: 60+ carriers, 53 known dead legs, bookability rates measured from 1,400+ real fare attempts, and 20 proven routing templates from actual bookings.

**Live endpoint:** `https://mcp.airtreks.com/mcp` - free, no API key, 100 requests/day.

Now with **real prices**: a historical range for any route in under a second, live fares for a specific itinerary, and a full multi-stop trip priced across several tickets — the same trip can vary three-fold depending on how it is ticketed, and that is the part no other flight tool will tell you.

## 30-second setup

### Claude Desktop

Settings → Connectors → **Add custom connector** → paste `https://mcp.airtreks.com/mcp`.

### Claude Code

```bash
claude mcp add --transport http airtreks https://mcp.airtreks.com/mcp
```

### Cursor

Add to `.cursor/mcp.json` (or Cursor Settings → MCP → Add new server):

```json
{
  "mcpServers": {
    "airtreks": {
      "url": "https://mcp.airtreks.com/mcp"
    }
  }
}
```

No API key is needed for any tool, the consultant handoff included. A key is
optional and only raises your daily limit; append it to the URL if your client
cannot send custom headers, as claude.ai connectors cannot:

```
https://mcp.airtreks.com/mcp?key=at_your_key
```

### ChatGPT

Settings → **Apps & Connectors** → enable Developer mode (Pro/Business plans) → add `https://mcp.airtreks.com/mcp` as a custom connector.

### Any other MCP client

Same JSON shape as Cursor above (Streamable HTTP). Prefer stdio? Run it locally:

```bash
npx airtreks-mcp
```

Then ask your agent:

> Plan a round-the-world trip: San Francisco, Tokyo, Bangkok, Singapore, Delhi, Istanbul, London, back to San Francisco.

## One call, one answer: a 7-leg RTW

Your user wants six stops around the world. Google Flights gives up. One `plan_route` call lays the trip out, and one `route_estimate` call says what it costs. Neither one picks airlines: AirTreks consultants do that when they build the ticket.

```json
{
  "cities": ["SFO", "NRT", "BKK", "SIN", "DEL", "IST", "LHR", "SFO"],
  "budget": "mid"
}
```

Real `plan_route` response, trimmed for length (the full version has notes for all 7 legs):

```json
{
  "route": "SFO -> NRT -> BKK -> SIN -> DEL -> IST -> LHR -> SFO",
  "totalLegs": 7,
  "isRoundTrip": true,
  "direction": "westbound",
  "backtracking": false,
  "regionsCrossed": ["americas", "asia", "europe"],
  "customBuild": {
    "strategy": "7-leg route. 1 surface sector opportunity.",
    "surfaceSectors": [
      {
        "insteadOf": "BKK -> SIN (leg 3)",
        "suggestion": "Bangkok to Singapore through Malaysia. Train, bus, or ultra-cheap LCC. Adds Malaysia and possibly Penang, KL, Melaka.",
        "savings": "Saves $100-250"
      }
    ],
    "complexity": "moderate"
  }
}
```

And `route_estimate` on the same cities:

```json
{
  "cabin": "economy",
  "currency": "USD",
  "estimate": { "low": 1616.43, "high": 2465.75 },
  "confidence": "medium",
  "basis": "1,616-2,466 USD per person, from AirTreks fare history. We have history for most of this route, but not all of it."
}
```

That is a range from past AirTreks bookings, not a quote. For a real number, `trip_idea_create` hands the complete trip - route, a date for every leg, passengers, cabin and the traveler's answers to our planning questions - to an AirTreks consultant who prices and books it.

## Tools

All tools are free and need no API key — 100 requests/day per IP.

### Routing

| Tool | Description |
|------|-------------|
| `plan_route` | Lay out a multi-city trip - direction, regions crossed, backtracking, surface-sector options, and how complex it is to ticket. No airline picks |
| `route_validate` | Validate a multi-city routing - alliance rules, dead legs, poison carriers, bookability |
| `route_suggest` | Get 3 suggested routings by region, direction, and alliance |
| `hub_check` | Best connection between two airports - dead leg detection + hub fixes |
| `fare_product_match` | Match the right fare product (RTW, Circle Pacific/Atlantic, Open Jaw, Custom) with typical price ranges |
| `custom_route_build` | Break a multi-city itinerary into legs with surface-sector options and how much each leg benefits from a consultant. No airline picks |

#### Pricing

| Tool | Description |
|------|-------------|
| `route_estimate` | Price range for a route from AirTreks fare history. No dates needed, answers in about a quarter of a second — the right tool when someone asks "what will this cost?" before anything is decided |
| `fare_quote` | Live fares for one specific itinerary on specific dates, priced as a single ticket |
| `itinerary_quote` | Prices a whole multi-stop trip and returns several ways to ticket it — cheapest, fastest, fewest stops — with the tickets each one is built from. Takes about a minute, so it returns a reference immediately |
| `itinerary_quote_status` | Fetches an `itinerary_quote` result by its reference, waiting up to about 40 seconds for one still pricing. Free to call again |

### Consultant handoff

| Tool | Description |
|------|-------------|
| `trip_idea_create` | Hand off to an AirTreks human travel consultant - submits the trip request with the full routing analysis attached |

Submits real customer contact details, so only call it with the customer's
knowledge and consent. Repeat submissions of the same email + route inside 24
hours return the existing trip request rather than creating a duplicate.

## Why this data is different

AirTreks has built complex multi-stop itineraries since 1987. This server exposes what that history taught us:

- **Dead legs** - city pairs that look bookable but fail on alliance fares, learned from 1,400+ real fare-construction failures
- **Bookability rates by leg count** - measured, not estimated (91% at 3-4 legs, 61% at 5-6, 6% at 7+)
- **Poison carriers and hub fixes** - we know what airline combinations break ticketing and what to route instead
- **Proven routing templates** from working with Multi-Stop and Around the World Intineraries for inviduals, families and large group

No other flight tool returns this because no other flight tool has priced these failures.

## REST API (no MCP client required)

Every tool is also a plain REST endpoint - same tools, same rate limits, JSON in/out. For agent frameworks that consume REST instead of MCP:

```bash
curl -X POST https://mcp.airtreks.com/api/plan_route \
  -H "Content-Type: application/json" \
  -d '{"cities": ["LAX", "NRT", "BKK", "LHR", "LAX"]}'
```

Full OpenAPI 3.1 spec: [`https://mcp.airtreks.com/openapi.json`](https://mcp.airtreks.com/openapi.json)

## Rate limits

- **Free:** 100 requests/day per IP, no key needed — every tool, `trip_idea_create` included
- **Registered:** higher limits with an API key (`X-API-Key` header, or `?key=` for clients that cannot set headers)

## Endpoints

| Path | Description |
|------|-------------|
| `/mcp` | MCP protocol endpoint (Streamable HTTP) |
| `/api/{tool}` | REST twin of each tool (POST, JSON body) |
| `/openapi.json` | OpenAPI 3.1 spec for the REST surface |
| `/health` | Health check |
| `/register` | Get an API key for a higher rate limit (POST) |
| `/privacy` | Privacy policy |
| `/favicon.ico`, `/favicon.svg` | AirTreks mark — the icon AI directories show for this server |
| `/` | Server info |

## License

AGPL-3.0-only
