/**
 * Terms of use served at GET /terms (AIR-1108).
 * OpenAI's plugin directory requires a terms-of-service URL alongside the
 * privacy policy, and airtreks.com has none. These cover the hosted service
 * only; bookings stay under the terms an AirTreks consultant gives at booking.
 * Keep them accurate to what the tools actually do - see tools/registry.ts.
 */

export const TERMS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>Terms of Use - AirTreks MCP Server</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
  h1 { font-size: 1.6em; } h2 { font-size: 1.15em; margin-top: 1.8em; }
  code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; }
</style>
</head>
<body>
<h1>AirTreks MCP Server Terms of Use</h1>
<p><em>Effective October 2026</em></p>

<p>These terms govern your use of the AirTreks MCP Server at <code>mcp.airtreks.com</code>
and its REST API, including through an AI assistant such as ChatGPT or Claude
(together, "the service"). The service is operated by AirTreks International LLC
("AirTreks", <a href="https://airtreks.com">airtreks.com</a>). By using it, you agree
to these terms.</p>

<h2>What the service does</h2>
<p>The service plans and prices trips with several stops. It can suggest and check
routings, estimate a price range from past AirTreks bookings, price a whole trip on
set dates, and send a trip request to an AirTreks travel consultant.</p>

<h2>Prices are information, not an offer</h2>
<ul>
<li>Price ranges are estimates drawn from past AirTreks bookings. They are not quotes.</li>
<li>Live prices are accurate when retrieved. Availability and price can change at any
time, and nothing is held or reserved for you.</li>
<li>The service does not book flights, issue tickets or take payment. A booking exists
only when you complete it with an AirTreks consultant, under the booking terms they
give you.</li>
<li>AI assistants reword what the service returns and can get details wrong. Confirm
routes, dates and prices with a consultant before you book.</li>
</ul>

<h2>Trip requests</h2>
<p>If you ask to send a trip to AirTreks, the name, email address, optional phone
number and trip details in that request go to AirTreks so a consultant can follow up,
usually by email. Submit only your own details, or someone else's with their
permission. The <a href="/privacy">privacy policy</a> explains how AirTreks handles
this data.</p>

<h2>Acceptable use</h2>
<p>Do not use the service to:</p>
<ul>
<li>get around its rate limits or overload it;</li>
<li>copy, resell or republish its data in bulk, or build a competing fare database;</li>
<li>submit trip requests that are false, automated with no real traveller behind them,
or made in someone else's name without permission;</li>
<li>break the law or infringe anyone's rights.</li>
</ul>
<p>AirTreks may limit, suspend or end access, including by revoking API keys, for use
that breaks these terms or harms the service.</p>

<h2>API keys</h2>
<p>Keep your API key private. You are responsible for requests made with it, and
AirTreks may change its limits or revoke it.</p>

<h2>No warranty and limit of liability</h2>
<p>The service is provided "as is" and "as available", and AirTreks may change or
withdraw it at any time. To the fullest extent the law allows, AirTreks disclaims all
warranties and is not liable for any loss arising from your use of, or reliance on,
the service, including fare changes before booking. Nothing in these terms limits
liability that cannot be limited by law.</p>

<h2>Governing law</h2>
<p>These terms are governed by the laws of the State of Washington, without regard to
its conflict-of-laws rules. Courts located in Washington have exclusive jurisdiction
over any dispute about the service.</p>

<h2>Open-source code</h2>
<p>The code behind the service is published at
<a href="https://github.com/Airtreks/airtreks-mcp">github.com/Airtreks/airtreks-mcp</a>
under its own license. These terms cover the hosted service, not the code.</p>

<h2>Changes and contact</h2>
<p>Updates to these terms are posted at this URL, and continuing to use the service
means you accept them. Questions:
<a href="mailto:sean@airtreks.com">sean@airtreks.com</a> or
<a href="https://airtreks.com/contact">airtreks.com/contact</a>.</p>
</body>
</html>
`;
