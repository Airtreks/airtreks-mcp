#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { checkRateLimit, peekRateLimit, getRateLimitHeaders } from "./lib/rate-limit.js";
import { matchPlatform, refreshOpenAIRanges, PLATFORM_SESSION_DAILY_LIMIT } from "./lib/cidr.js";
import { PRIVACY_HTML } from "./privacy.js";

// Single version source: package.json (works from both src/ via tsx and dist/).
const PKG_VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
).version || "0.0.0";
import { trackRequest, trackToolCall, trackError, trackRateLimitHit, getStats } from "./lib/stats.js";
import { lookupKey, registerKey, listKeys, revokeKey, revokeKeysByEmail, apiKeyFromRequest } from "./lib/api-keys.js";
import { TOOLS, normalizeCityArgs } from "./tools/registry.js";
import { handleRest } from "./rest.js";

// Served at /.well-known/mcp/server.json for Registry auto-discovery. Read once
// at startup; ../server.json resolves to the repo root (dev) and /app (Docker).
let serverManifest = "{}";
try {
  serverManifest = readFileSync(fileURLToPath(new URL("../server.json", import.meta.url)), "utf8");
} catch {
  console.warn("[server.json] manifest not found next to app root; serving empty {}");
}

function tracked(name: string, fn: (args: any) => any) {
  return async (args: any) => {
    args = normalizeCityArgs(args);
    trackToolCall(name, args);
    try {
      const result = await fn(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      trackError();
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }] };
    }
  };
}

// All routing tools are pure lookups against bundled data (readOnlyHint, closed
// world). trip_idea_create is the exception: it submits a trip request.
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const LEAD_TOOL = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

function registerTools(server: McpServer, includeLeadTools = false) {
  for (const tool of TOOLS) {
    if (tool.requiresKey && !includeLeadTools) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.readOnly ? { ...READ_ONLY } : { ...LEAD_TOOL },
      },
      tracked(tool.name, tool.fn)
    );
  }
}

// --- Stdio mode (local / Claude Code) ---

async function startStdio() {
  const server = new McpServer({ name: "airtreks", version: PKG_VERSION });
  registerTools(server, true); // local dev gets all tools
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AirTreks MCP server running on stdio");
}

// --- HTTP mode (Railway / remote) ---

async function startHttp() {
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Session store: sessionId -> { transport, server, lastUsed, hasApiKey }
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer; lastUsed: number; hasApiKey: boolean }>();

  // Clean up stale sessions every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [sid, session] of sessions) {
      if (now - session.lastUsed > 10 * 60 * 1000) { // 10 min TTL
        session.transport.close().catch(() => {});
        session.server.close().catch(() => {});
        sessions.delete(sid);
      }
    }
  }, 5 * 60 * 1000);

  function createSession(hasApiKey: boolean): { sid: string; transport: StreamableHTTPServerTransport; server: McpServer } {
    const sid = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sid,
    });
    const mcpServer = new McpServer({ name: "airtreks", version: PKG_VERSION });
    registerTools(mcpServer, hasApiKey);

    transport.onclose = () => sessions.delete(sid);
    sessions.set(sid, { transport, server: mcpServer, lastUsed: Date.now(), hasApiKey });

    return { sid, transport, server: mcpServer };
  }

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "airtreks-mcp", version: PKG_VERSION, sessions: sessions.size, rateLimit: "100/day per IP" }));
      return;
    }

    // MCP Registry auto-discovery: serve the server.json manifest.
    if (url.pathname === "/.well-known/mcp/server.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(serverManifest);
      return;
    }

    // Parallel REST surface: GET /openapi.json + POST /api/{tool} (AIR-461)
    if (await handleRest(req, res, url)) return;

    // Register endpoint — get an API key
    if (url.pathname === "/register" && req.method === "POST") {
      const regSecret = process.env.REGISTER_SECRET || "";
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const { email, name, secret } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "email is required" }));
          return;
        }
        // If REGISTER_SECRET is set, require it (prevents spam)
        if (regSecret && secret !== regSecret) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid registration secret. Contact partnerships@airtreks.com for access." }));
          return;
        }
        const key = registerKey(email, name || "");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          apiKey: key.key,
          email: key.email,
          tier: key.tier,
          dailyLimit: key.dailyLimit,
          usage: "Include header: X-API-Key: " + key.key,
          mcpEndpoint: "https://mcp.airtreks.com/mcp",
        }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body. Send {\"email\": \"you@example.com\", \"name\": \"Your Name\"}" }));
      }
      return;
    }

    // Key management (admin)
    if (url.pathname === "/keys") {
      const secret = process.env.STATS_SECRET || "";
      const provided = url.searchParams.get("key") || req.headers["x-stats-key"] as string || "";
      if (!secret || provided !== secret) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      // DELETE /keys with {"key": "at_..."} or {"email": "..."} revokes (AIR-458)
      if (req.method === "DELETE") {
        let body = "";
        for await (const chunk of req) body += chunk;
        try {
          const { key, email } = JSON.parse(body);
          if (!key && !email) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Provide \"key\" or \"email\" in the JSON body" }));
            return;
          }
          const revoked = key ? (revokeKey(key) ? 1 : 0) : revokeKeysByEmail(email);
          if (revoked === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No matching key" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ revoked }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body. Send {\"key\": \"at_...\"} or {\"email\": \"user@example.com\"}" }));
        }
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(listKeys(), null, 2));
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      // Auth + rate limiting on POST requests
      if (req.method === "POST") {
        const apiKey = apiKeyFromRequest(req.headers as Record<string, unknown>, url);
        const keyRecord = apiKey ? lookupKey(apiKey) : null;
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
          || req.socket.remoteAddress || "unknown";

        // Track by key email or IP
        trackRequest(keyRecord?.email || ip);

        // Rate limit: API key uses key's limit; known AI-platform egress ranges
        // (all users behind a few IPs) share one big platform bucket; other
        // anonymous traffic uses IP-based 100/day
        const platform = keyRecord ? null : matchPlatform(ip);
        const bucketKey = keyRecord ? keyRecord.key : platform ? `platform:${platform.name}` : `ip:${ip}`;
        const dailyLimit = keyRecord ? keyRecord.dailyLimit : platform ? platform.dailyLimit : 100;
        // On a shared platform pool, check this conversation's own share FIRST —
        // peeked, not charged, so a request that is about to be refused does not
        // also spend from the pool everyone else is drawing on.
        if (platform) {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId) {
            const sessionRl = peekRateLimit(`sess:${sessionId}`, PLATFORM_SESSION_DAILY_LIMIT);
            if (!sessionRl.allowed) {
              trackRateLimitHit();
              res.writeHead(429, { "Content-Type": "application/json", ...getRateLimitHeaders(sessionRl) });
              res.end(JSON.stringify({
                error: "Rate limit exceeded for this conversation",
                limit: sessionRl.limit,
                resetAt: new Date(sessionRl.resetAt).toISOString(),
                message: `This conversation has used its ${sessionRl.limit} requests/day. Starting a new conversation resets it, or register for an API key for a higher limit: POST https://mcp.airtreks.com/register`,
              }));
              return;
            }
            checkRateLimit(`sess:${sessionId}`, PLATFORM_SESSION_DAILY_LIMIT);
          }
        }

        const rl = checkRateLimit(bucketKey, dailyLimit);

        if (!rl.allowed) {
          trackRateLimitHit();
          const upgradeMsg = keyRecord
            ? `${keyRecord.tier} tier: ${rl.limit} requests/day. Contact partnerships@airtreks.com for higher limits.`
            : `Free tier: ${rl.limit} requests/day. Register for an API key for higher limits: POST https://mcp.airtreks.com/register`;
          res.writeHead(429, { "Content-Type": "application/json", ...getRateLimitHeaders(rl) });
          res.end(JSON.stringify({
            error: "Rate limit exceeded",
            limit: rl.limit,
            resetAt: new Date(rl.resetAt).toISOString(),
            message: upgradeMsg,
            register: keyRecord ? undefined : "POST https://mcp.airtreks.com/register with {\"email\": \"you@example.com\"}",
          }));
          return;
        }
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // Existing session
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        session.lastUsed = Date.now();
        await session.transport.handleRequest(req, res);
        return;
      }

      // New session (POST without session ID = initialization)
      if (req.method === "POST" && !sessionId) {
        // Tool visibility follows the presented key (header or ?key=) —
        // claude.ai connectors can only pass it in the URL.
        const sessionKey = apiKeyFromRequest(req.headers as Record<string, unknown>, url);
        const hasKey = !!(sessionKey && lookupKey(sessionKey));
        const { transport, server: mcpServer } = createSession(hasKey);
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      // MCP spec: 404 for unknown/expired sessions tells clients to silently
      // re-initialize; 400 surfaces as a hard tool error mid-conversation (AIR-497)
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or expired session. Send an initialize request without a session ID to start a new session." }));
      return;
    }

    // Stats dashboard (protected)
    if (url.pathname === "/stats") {
      const secret = process.env.STATS_SECRET || "";
      const provided = url.searchParams.get("key") || req.headers["x-stats-key"] as string || "";
      if (!secret || provided !== secret) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized. Provide ?key= or X-Stats-Key header." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getStats(), null, 2));
      return;
    }

    // Privacy policy (required for AI connector directory listings)
    if (url.pathname === "/privacy") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(PRIVACY_HTML);
      return;
    }

    // Root — info page
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "AirTreks MCP Server",
        version: PKG_VERSION,
        description: "Complex flight routing intelligence for AI agents",
        mcp_endpoint: "/mcp",
        rest_api: "POST /api/{tool} with a JSON body of tool arguments",
        openapi: "https://mcp.airtreks.com/openapi.json",
        free_tools: ["plan_route", "route_estimate", "fare_quote", "itinerary_quote", "itinerary_quote_status", "route_validate", "route_suggest", "hub_check", "fare_product_match", "custom_route_build", "trip_idea_create"],
        rate_limit: "100 requests/day (free), higher with API key",
        register: "POST /register with {\"email\": \"you@example.com\"}",
        docs: "https://github.com/Airtreks/airtreks-mcp",
        privacy: "https://mcp.airtreks.com/privacy",
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  httpServer.listen(PORT, () => {
    console.log(`AirTreks MCP server running on http://0.0.0.0:${PORT}`);
    console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  });

  // OpenAI rotates its published egress ranges; keep the openai bucket current
  void refreshOpenAIRanges();
  setInterval(() => void refreshOpenAIRanges(), 24 * 60 * 60 * 1000).unref();
}

// --- Entry point ---

const mode = process.env.MCP_TRANSPORT || (process.env.PORT ? "http" : "stdio");

if (mode === "http") {
  startHttp().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
