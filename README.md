# AirTreks MCP Server

[![smithery badge](https://smithery.ai/badge/bootsnall/airtreks)](https://smithery.ai/servers/bootsnall/airtreks)

**The complex-itinerary tool for AI agents.** Multi-stop, round-the-world, open-jaw, surface segments - the trips that standard flight search can't handle. When your user asks for 3+ stops across continents, this server answers with routing analysis built on real AirTreks fare-construction data: 60+ carriers, 53 known dead legs, bookability rates measured from 1,400+ real fare attempts, and 20 proven routing templates from actual bookings.

**Live endpoint:** `https://mcp.airtreks.com/mcp` - free, no API key, 100 requests/day.

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

### ChatGPT

Settings → **Apps & Connectors** → enable Developer mode (Pro/Business plans) → add `https://mcp.airtreks.com/mcp` as a custom connector.

### Any other MCP client

Same JSON shape as Cursor above (Streamable HTTP). Prefer stdio? Run it locally:

```bash
npx airtreks-mcp
```

Then ask your agent:

> Plan a round-the-world trip: San Francisco, Tokyo, Bangkok, Singapore, Delhi, Istanbul, London, back to San Francisco.

## One call, one answer: a 6-stop RTW

Your user wants six stops around the world. Google Flights gives up. Alliance RTW booking sites will let them build it, then fail at ticketing. One `plan_route` call tells your agent what actually works:

```json
{
  "cities": ["SFO", "NRT", "BKK", "SIN", "DEL", "IST", "LHR", "SFO"],
  "budget": "mid"
}
```

Real response, trimmed for length (the full version includes carrier alternatives and consultant notes for all 7 legs):

```json
{
  "route": "SFO -> NRT -> BKK -> SIN -> DEL -> IST -> LHR -> SFO",
  "totalLegs": 7,
  "isRoundTrip": true,
  "direction": "westbound",
  "backtracking": false,
  "regionsCrossed": ["americas", "asia", "europe"],
  "recommended": {
    "approach": "custom",
    "confidence": "high",
    "reason": "7 legs — alliance fares have <6% bookability. Custom build with mixed carriers is the way to go."
  },
  "customBuild": {
    "strategy": "Mixed-carrier build using alliance carriers, Gulf bridge connections. 1 surface sector opportunity.",
    "segments": [
      {
        "leg": 1, "from": "SFO", "to": "NRT",
        "carrier": { "code": "NH", "name": "ANA", "why": "Best transpacific availability. LAX/SFO/SEA-NRT direct." }
      },
      {
        "leg": 5, "from": "DEL", "to": "IST",
        "carrier": { "code": "TK", "name": "Turkish Airlines", "type": "gulf-bridge", "why": "Cheapest Asia-Europe usually. IST connects everywhere." }
      }
    ],
    "surfaceSectors": [
      {
        "insteadOf": "BKK -> SIN (leg 3)",
        "suggestion": "Bangkok to Singapore through Malaysia. Train, bus, or ultra-cheap LCC. Adds Malaysia and possibly Penang, KL, Melaka.",
        "savings": "Saves $100-250"
      }
    ]
  },
  "allianceFeasibility": {
    "starAlliance": { "viable": false, "summary": "Technically possible on Star Alliance but only 6% bookability at 7 legs. Custom build strongly recommended." },
    "oneworld": { "viable": false, "summary": "Technically possible on oneworld but only 6% bookability at 7 legs. Custom build strongly recommended." }
  }
}
```

That single call just told your agent four things it can't get anywhere else:

- **Alliance RTW fares fail on this trip.** 7 legs prices at 6% bookability - your user would build it, hit a wall at ticketing, and blame you.
- **The build that works:** a per-leg carrier plan - ANA transpacific, Turkish Airlines as the Asia-Europe bridge, each with alternatives and trade-offs.
- **Where to not fly at all:** Bangkok to Singapore is cheaper overland through Malaysia, saving $100-250 and adding a country.
- **What it typically costs:** `fare_product_match` puts this trip at $2,500-$8,000 economy on an alliance RTW fare, typically $3,000-$12,000 as a custom build.

Those are honest ranges, not quotes - exact pricing on a 7-leg mixed-carrier itinerary depends on fare-class availability the day you book. For a real number, `trip_idea_create` hands the full routing analysis to an AirTreks consultant who prices and books the actual ticket. Your user gets an expert who starts informed, not a form to fill out.

## Tools

### Free (no API key, 100 req/day)

| Tool | Description |
|------|-------------|
| `plan_route` | Primary entry point - give it cities, it evaluates Star Alliance RTW, oneworld RTW, and custom mixed-carrier builds, then recommends the best approach |
| `route_validate` | Validate a multi-city routing - alliance rules, dead legs, poison carriers, bookability |
| `route_suggest` | Get 3 suggested routings by region, direction, and alliance |
| `hub_check` | Best connection between two airports - dead leg detection + hub fixes |
| `fare_product_match` | Match the right fare product (RTW, Circle Pacific/Atlantic, Open Jaw, Custom) with typical price ranges |
| `custom_route_build` | Break complex itineraries into individually-ticketable segments with carrier recommendations |

### API key required

| Tool | Description |
|------|-------------|
| `trip_idea_create` | Hand off to an AirTreks human travel consultant - submits the trip request with the full routing analysis attached |

Get a key: `POST https://mcp.airtreks.com/register` with `{"email": "you@example.com"}`

## Why this data is different

AirTreks has built complex multi-stop itineraries since 1987. This server exposes what that history taught us:

- **53 dead legs** - city pairs that look bookable but fail on alliance fares, learned from 1,400+ real fare-construction failures
- **Bookability rates by leg count** - measured, not estimated (91% at 3-4 legs, 61% at 5-6, 6% at 7+)
- **Poison carriers and hub fixes** - which airline combinations break ticketing and what to route instead
- **20 proven routing templates** from top AirTreks bookings

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

- **Free:** 100 requests/day per IP, no key needed
- **Registered:** higher limits with an API key (`X-API-Key` header)
- `trip_idea_create` requires a key

## Endpoints

| Path | Description |
|------|-------------|
| `/mcp` | MCP protocol endpoint (Streamable HTTP) |
| `/api/{tool}` | REST twin of each tool (POST, JSON body) |
| `/openapi.json` | OpenAPI 3.1 spec for the REST surface |
| `/health` | Health check |
| `/register` | Get an API key (POST) |
| `/privacy` | Privacy policy |
| `/` | Server info |

## License

AGPL-3.0-only
