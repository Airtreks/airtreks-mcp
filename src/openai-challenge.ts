/**
 * OpenAI plugin domain verification, served at
 * GET /.well-known/openai-apps-challenge (AIR-1108).
 *
 * Connecting the MCP server in OpenAI's plugin dashboard shows a challenge
 * token, and the portal checks that this URL on the MCP hostname answers with
 * exactly that token as plain text — not JSON, not a list. The token comes from
 * the OPENAI_APPS_CHALLENGE variable so verifying never needs a code change:
 * set it on the hosted service, let it redeploy, then press verify. Unset, the
 * path 404s like any other unknown URL.
 */

import { IncomingMessage, ServerResponse } from "node:http";

export const OPENAI_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";

/** Returns true when the request was for the challenge path and has been answered. */
export function handleOpenAIChallenge(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  if (url.pathname !== OPENAI_CHALLENGE_PATH) return false;

  const token = (process.env.OPENAI_APPS_CHALLENGE || "").trim();
  if (!token || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(404);
    res.end();
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(token),
    "Cache-Control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : token);
  return true;
}
