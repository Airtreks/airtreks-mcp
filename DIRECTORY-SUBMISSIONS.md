# MCP Directory Submissions

## Metadata pack (canonical - copy from here, never retype)

| Field | Value |
|-------|-------|
| Name | AirTreks MCP (`io.github.Airtreks/airtreks-mcp`) |
| One-sentence description | Multi-city flight routing intelligence — plan RTW trips, validate alliances, get carrier picks. |
| Long description | Complex multi-city flight routing intelligence for AI agents, with real prices. 10 tools: plan round-the-world trips across 60+ carriers, validate Star Alliance and oneworld routings, get segment-by-segment carrier recommendations, identify surface sector savings, price a route from AirTreks fare history, quote live fares for a specific itinerary, price a whole multi-stop trip across several tickets, and hand off to human consultants. No API key needed (100 req/day free). |
| Tool list | Routing: `plan_route`, `route_validate`, `route_suggest`, `hub_check`, `fare_product_match`, `custom_route_build`. Pricing: `route_estimate`, `fare_quote`, `itinerary_quote`, `itinerary_quote_status`. All eleven free, `trip_idea_create` included — no API key. |
| Transport | Streamable HTTP at `https://mcp.airtreks.com/mcp`; stdio via `npx airtreks-mcp` |
| Auth model | None — every tool is open, 100 req/day per IP. An optional API key raises that limit: `POST https://mcp.airtreks.com/register` |
| Repo | https://github.com/Airtreks/airtreks-mcp — note the MCP Registry namespace is still `io.github.Airtreks/airtreks-mcp`, and `server.json` keeps the old URL to match it. Changing the namespace registers a *different* server rather than renaming this one, so it needs a deliberate decision plus a publish from that GitHub identity. The old URL 301-redirects, so nothing is broken. |
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
| OpenAI plugin directory (ChatGPT + Codex) | Package ready in `chatgpt-plugin/` (AIR-1108); awaiting Sean: org verification, terms approval, video, submission | https://platform.openai.com/plugins |

---

## OpenAI plugin directory (ChatGPT and Codex) — https://platform.openai.com/plugins (AIR-1108, AIR-499)

OpenAI now calls these *plugins*, and one directory serves ChatGPT and Codex. A
submission is a ZIP of a plugin package plus a connected MCP server. The process
below was read from https://developers.openai.com/plugins/deploy/submission on
2026-10-06. Re-read it before submitting, because it has changed more than once.

**Ready on our side:**
- Server: every tool carries the Apps SDK status text, a per-tool `noauth`
  security scheme and all three annotation hints (1.2.6). The privacy policy is at
  https://mcp.airtreks.com/privacy, and the anonymous `openai` egress rate-limit
  bucket exists (AIR-499).
- Terms of use at https://mcp.airtreks.com/terms (1.2.7). **This is a draft for
  Sean to approve.** airtreks.com has no terms page, and the directory requires one.
- Domain verification: `/.well-known/openai-apps-challenge` serves the
  `OPENAI_APPS_CHALLENGE` variable (1.2.7).
- The package itself, in [`chatgpt-plugin/`](chatgpt-plugin/):
  - `plugin.json`: listing text, the four URLs, icons, the 5 positive and 3
    negative review cases, release notes, `countries: []` (every country) and
    `commerce: false`.
  - `mcp.json`: the one server.
  - `assets/`: the brand icons.

  `src/chatgpt-plugin.test.ts` checks it against the upload limits on every CI run.

**Editing the package:**
- Test cases imported from the ZIP are read-only in the dashboard. Change them in
  `plugin.json`, rebuild and upload again.
- Bump the package `version` (separate from the npm version) on every upload.
- The review prompts use March 2027 dates. Refresh them before then; a test fails
  once they are in the past.
- No `trip_idea_create` review case, on purpose: reviewers run the cases against
  production, so a case for it would put reviewer leads in front of consultants.
  The tool still ships.

### Build the ZIP

`plugin.json` must sit at the root of the ZIP, not inside a folder:

```bash
cd chatgpt-plugin && zip -r ../airtreks-chatgpt-plugin.zip . -x '.*' && cd ..
```

### One-time setup (Sean)

1. **Verify the org** in https://platform.openai.com/settings. Use *business*
   verification to publish as AirTreks; individual verification publishes under a
   personal name, and an unverified publisher is rejected. The listing URLs must
   "identify the same publisher as the submission". The privacy and terms pages
   say "AirTreks", so if the verified legal name is different, add it to those pages.
2. Whoever submits needs to be an org owner or have **Apps Management Write**.
3. **Approve the terms wording** at https://mcp.airtreks.com/terms (source:
   `src/terms.ts`). It covers the hosted service only, and has no governing-law
   clause; add one if you want it.
4. **Record the video** (shot list below), upload it where reviewers can open it
   without signing in (YouTube unlisted, Loom, or Drive "anyone with the link"),
   and keep the URL.

### Submit

1. **Plugins → Upload new or existing plugin**, choose the verified developer
   identity, and upload the ZIP.
2. **Metadata & Skills:** wait for the checks. Fix any issue in `plugin.json`,
   rebuild and upload again.
3. **MCPs → Connect:** server URL `https://mcp.airtreks.com/mcp`, no authentication.
4. **Domain verification:** the portal shows a token.
   - In Railway, set `OPENAI_APPS_CHALLENGE=<token>` on the airtreks-mcp-server
     production service, and deploy the staged change.
   - Check that `curl https://mcp.airtreks.com/.well-known/openai-apps-challenge`
     prints exactly the token, then press verify.
5. **Tool scan:** expect 11 tools. If it asks for annotation justifications, paste
   them from the table below.
6. **Review information → Review details:**
   - The test cases and release notes come from the ZIP.
   - Paste the video URL; it is not in the ZIP.
   - Leave reviewer credentials empty; there is no sign-in.
7. **Submit for review** and confirm the policy attestations. Only one review can
   be active at a time. Rejections arrive by email; reply to that email to appeal.
8. After approval, select **Publish plugin**, then update the status table above.

**After publication:**
- OpenAI rescans the server daily. A changed tool is held until it passes the
  automated checks, so keep input schemas backwards compatible.
- Changing the MCP URL needs OpenAI support.
- Changing listing text, review cases or icons needs a new ZIP.

### Video shot list (about 3-5 minutes)

1. In ChatGPT, open **Plugins → + → Add custom MCP server**, enter
   `https://mcp.airtreks.com/mcp`, and choose no authentication.
2. Run the five positive prompts from `plugin.json` in order, word for word.
   - Keep each tool call visible.
   - For case 5, show the status text while the trip prices (about a minute).
3. Run the three negative prompts and show that no AirTreks tool is called.
4. Show one prompt on mobile as well as desktop; the guidelines require both to work.
5. The directory also serves Codex. Reviewers check "the supported ChatGPT and
   Codex surfaces where the plugin will be available", so run one case in Codex
   if it will be listed there.

### Annotation justifications

The guidelines say justifications are no longer required, but the
submission-errors page still lists `justification_required`. Keep these ready:

| Tools | readOnly | destructive | openWorld | Justification |
|---|---|---|---|---|
| `plan_route`, `route_validate`, `route_suggest`, `hub_check`, `fare_product_match`, `custom_route_build` | true | false | false | Computes routing advice from data bundled with the server. Stores nothing, changes nothing, contacts no one. |
| `route_estimate` | true | false | false | Reads AirTreks' own record of past fares and returns a price range. Changes nothing. |
| `fare_quote` | true | false | false | Looks up live fares in AirTreks' own pricing system and returns them. Holds no seats, creates no booking, sends nothing. A bounded private system, not open-ended destinations. |
| `itinerary_quote` | true | false | false | Starts an in-memory price calculation whose only output goes back to the same caller through `itinerary_quote_status`. It holds no seats, creates no booking, and is discarded after 10 minutes. |
| `itinerary_quote_status` | true | false | false | Reads the result of a calculation started by `itinerary_quote`. Changes nothing. |
| `trip_idea_create` | false | false | true | Creates a trip request in AirTreks' booking system so a human consultant can follow up with the traveller. Additive: a repeat call with the same email and route within 24 hours returns the existing request instead of a second one. Open world, because the traveller's details reach people outside the conversation. |

**Known risks, not yet decided (AIR-1108):**
- The guidelines say to use `readOnlyHint: false` for "starting stateful jobs or
  workflows, queuing work", which reads on `itinerary_quote`.
- They also say to use `destructiveHint: true` for "irreversible sends … through
  indirect side effects", which reads on the emails `trip_idea_create` triggers.

Changing either one makes ChatGPT ask the user to confirm before the call.

---

## Official MCP Registry

Published 2026-07-13 as `io.github.Airtreks/airtreks-mcp` v1.0.2 (isLatest, active) with the streamable-http remote and the 4 canonical icons. To publish a new version: bump `version` in `server.json` (registry rejects duplicates), then `mcp-publisher login github && mcp-publisher publish` from the repo root.

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
