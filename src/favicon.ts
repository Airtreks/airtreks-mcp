/**
 * Favicon served at GET /favicon.ico and GET /favicon.svg (AIR-742).
 *
 * The Claude MCP directory takes a listing's icon from the favicon of the MCP
 * server URL, and Anthropic's guidance is to leave the custom icon URL unset so
 * that favicon is what shows. "/" here answers JSON, so there is no HTML
 * <link rel="icon"> for a crawler to fall back on — the file has to exist at
 * the well-known path.
 *
 * The assets are the airtreks.com mark byte-for-byte (same files the site
 * serves, and the same SVG as the brand icon in server.json). They ship in the
 * package via "files" in package.json, and resolve from the app root the way
 * server.json does — repo root under tsx, /app in Docker, and the installed
 * package root for the hosted deployment's git dependency.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IncomingMessage, ServerResponse } from "node:http";

type Icon = { body: Buffer; contentType: string };

function loadIcon(file: string, contentType: string): Icon | null {
  try {
    return { body: readFileSync(fileURLToPath(new URL(`../public/${file}`, import.meta.url))), contentType };
  } catch {
    console.warn(`[favicon] public/${file} not found next to app root; serving 404`);
    return null;
  }
}

// Read once at startup. A missing file stays null and 404s rather than throwing
// per request — a favicon is never worth taking the server down for.
const ICONS = new Map<string, Icon | null>([
  ["/favicon.ico", loadIcon("favicon.ico", "image/x-icon")],
  ["/favicon.svg", loadIcon("favicon.svg", "image/svg+xml")],
]);

// Directory crawlers refetch on their own schedule and browsers hit this on
// every /privacy visit; a day of caching is plenty without making a brand
// change take a week to surface.
const CACHE_CONTROL = "public, max-age=86400";

/** Returns true when the request was a favicon request and has been answered. */
export function handleFavicon(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  const icon = ICONS.get(url.pathname);
  if (icon === undefined) return false;

  if (icon === null) {
    res.writeHead(404);
    res.end();
    return true;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Allow": "GET, HEAD" });
    res.end();
    return true;
  }

  res.writeHead(200, {
    "Content-Type": icon.contentType,
    "Content-Length": icon.body.length,
    "Cache-Control": CACHE_CONTROL,
  });
  res.end(req.method === "HEAD" ? undefined : icon.body);
  return true;
}
