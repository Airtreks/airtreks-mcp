/**
 * Privacy policy served at GET /privacy.
 * Required for AI connector directory listings (Anthropic, OpenAI).
 * Keep this accurate to what the code actually collects - see stats.ts,
 * api-keys.ts, and tools/trip-idea-create.ts.
 */

export const PRIVACY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy - AirTreks MCP Server</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
  h1 { font-size: 1.6em; } h2 { font-size: 1.15em; margin-top: 1.8em; }
  code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; }
</style>
</head>
<body>
<h1>AirTreks MCP Server Privacy Policy</h1>
<p><em>Effective July 13, 2026</em></p>

<p>The AirTreks MCP Server (<code>mcp.airtreks.com</code>) is operated by AirTreks
(<a href="https://airtreks.com">airtreks.com</a>). It provides flight-routing tools
to AI agents and assistants. This policy describes what data the server collects
and how it is used.</p>

<h2>What we collect</h2>
<ul>
<li><strong>Request metadata.</strong> Your IP address, used for rate limiting and
daily aggregate usage statistics (request counts and unique-visitor counts).</li>
<li><strong>Tool inputs.</strong> The parameters sent to our tools (city codes,
dates, cabin, number of travellers) are used to answer the request. For the
routing tools, we keep only aggregate counters of which tools and routes are
queried. For the pricing tools, the route and search parameters are also recorded
individually in our fare-pricing system's request log, so we can investigate
pricing problems and understand demand. Those records contain no names, contact
details, or payment information.</li>
<li><strong>API key registration.</strong> If you request an API key via
<code>POST /register</code>, we store the email address and optional name you provide.</li>
<li><strong>Trip ideas.</strong> If an agent calls <code>trip_idea_create</code> (API-key
tier only), the customer contact details (email, name, phone) and trip details in
that request are forwarded to AirTreks' booking system so a human travel consultant
can follow up. Only submit this data with the customer's knowledge and consent.</li>
</ul>

<h2>What we do not collect</h2>
<ul>
<li>No conversation content beyond the tool parameters an agent sends.</li>
<li>No cookies, tracking pixels, or advertising identifiers.</li>
<li>We never sell or rent any data to third parties.</li>
</ul>

<h2>Who receives the data</h2>
<p>Data stays within AirTreks, with one exception. To return a live fare, the
route, dates, cabin and traveller counts you send are passed to the global flight
distribution system AirTreks books through — the same one a travel agent queries.
No names, contact details, or payment information are sent with a fare search.
Trip ideas go to AirTreks' customer-relationship system for consultant follow-up.
The server is hosted on Railway (United States).</p>

<h2>Retention</h2>
<p>Usage statistics for the routing tools are stored as daily aggregates.
Pricing-request logs are kept per request, under AirTreks' internal data
practices, and hold only search parameters — no personal details. API key records
are kept until you ask us to remove them. Trip-idea data is handled under
AirTreks' customer data practices.</p>

<h2>Your choices</h2>
<p>To access or delete your API key record or any data submitted about you, email
<a href="mailto:sean@airtreks.com">sean@airtreks.com</a>. We respond to all requests.</p>

<h2>Changes</h2>
<p>Updates to this policy are posted at this URL.</p>
</body>
</html>
`;
