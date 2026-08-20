import { z } from "zod";
import { IncomingMessage, ServerResponse } from "node:http";
import { TOOLS, normalizeCityArgs } from "./tools/registry.js";
import { checkRateLimit, getRateLimitHeaders } from "./lib/rate-limit.js";
import { matchPlatform } from "./lib/cidr.js";
import { lookupKey, apiKeyFromRequest } from "./lib/api-keys.js";
import { trackRequest, trackToolCall, trackError, trackRateLimitHit } from "./lib/stats.js";

// Parallel REST surface for the MCP tools (AIR-461). Many agent frameworks
// consume REST, not MCP — same tools, same rate limits, plain JSON in/out.

const HOST = "https://mcp.airtreks.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

export interface RestResult {
  status: number;
  body: unknown;
}

export async function executeRestTool(name: string, args: unknown, hasApiKey: boolean): Promise<RestResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      status: 404,
      body: { error: `Unknown tool '${name}'`, available: TOOLS.map((t) => `/api/${t.name}`) },
    };
  }
  if (tool.requiresKey && !hasApiKey) {
    return {
      status: 401,
      body: {
        error: `'${name}' requires an API key. Include header: X-API-Key: <key>`,
        register: `POST ${HOST}/register with {"email": "you@example.com"}`,
      },
    };
  }
  const parsed = z.object(tool.schema).safeParse(args ?? {});
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: "Invalid arguments",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }
  trackToolCall(name, parsed.data);
  try {
    const result = await tool.fn(normalizeCityArgs(parsed.data));
    return { status: 200, body: result };
  } catch (err: any) {
    trackError();
    return { status: 500, body: { error: err.message } };
  }
}

let openApiDoc: object | null = null;

export function buildOpenApiDoc(): object {
  const paths: Record<string, any> = {};
  for (const tool of TOOLS) {
    const schema: any = z.toJSONSchema(z.object(tool.schema));
    delete schema.$schema; // implied by the OpenAPI 3.1 document
    paths[`/api/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: tool.description,
        tags: [tool.readOnly ? "routing" : "booking"],
        // security: [] = explicitly public (free tier, rate-limited by IP)
        security: tool.requiresKey ? [{ ApiKeyAuth: [] }] : [],
        requestBody: {
          required: true,
          content: { "application/json": { schema } },
        },
        responses: {
          "200": {
            description: "Tool result — JSON object, shape varies by tool.",
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
          "400": { description: "Invalid arguments (body lists the failing fields)." },
          ...(tool.requiresKey ? { "401": { description: "Missing or invalid X-API-Key." } } : {}),
          "429": { description: "Rate limit exceeded. Free tier: 100 requests/day per IP." },
        },
      },
    };
  }
  paths["/register"] = {
    post: {
      operationId: "register",
      summary: "Register for an API key",
      description: "Get an API key for higher rate limits and the consultant-handoff tool (trip_idea_create).",
      tags: ["auth"],
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" },
              },
              required: ["email"],
            },
          },
        },
      },
      responses: {
        "200": { description: "API key issued." },
        "403": { description: "Registration currently requires a secret — contact partnerships@airtreks.com." },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "AirTreks Routing API",
      version: "1.0.0",
      description:
        "Multi-stop flight API for AI agents — the REST twin of the AirTreks MCP server (https://mcp.airtreks.com/mcp). Plan, validate, and price complex multi-city and round-the-world (RTW) itineraries: alliance feasibility, carrier recommendations, hub connections, fare product matching, and consultant handoff. Built by AirTreks, multi-stop flight specialists since 1987.",
      contact: { name: "AirTreks partnerships", email: "partnerships@airtreks.com", url: "https://airtreks.com" },
      license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
    },
    servers: [{ url: HOST }],
    externalDocs: { description: "AirTreks developer docs", url: "https://airtreks.com/developers" },
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
    },
    paths,
  };
}

/** Handles GET /openapi.json and POST /api/{tool}. Returns false if the URL is not REST-surface. */
export async function handleRest(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === "/openapi.json") {
    openApiDoc ??= buildOpenApiDoc();
    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify(openApiDoc, null, 2));
    return true;
  }

  if (!url.pathname.startsWith("/api/")) return false;
  const name = url.pathname.slice("/api/".length);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ error: "Use POST with a JSON body of tool arguments.", spec: `${HOST}/openapi.json` }));
    return true;
  }

  // Auth + rate limiting — same buckets and limits as the /mcp transport
  const apiKey = apiKeyFromRequest(req.headers as Record<string, unknown>, url);
  const keyRecord = apiKey ? lookupKey(apiKey) : null;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress || "unknown";
  trackRequest(keyRecord?.email || ip);

  const platform = keyRecord ? null : matchPlatform(ip);
  const bucketKey = keyRecord ? keyRecord.key : platform ? `platform:${platform.name}` : `ip:${ip}`;
  const dailyLimit = keyRecord ? keyRecord.dailyLimit : platform ? platform.dailyLimit : 100;
  const rl = checkRateLimit(bucketKey, dailyLimit);

  if (!rl.allowed) {
    trackRateLimitHit();
    res.writeHead(429, { "Content-Type": "application/json", ...CORS_HEADERS, ...getRateLimitHeaders(rl) });
    res.end(JSON.stringify({
      error: "Rate limit exceeded",
      limit: rl.limit,
      resetAt: new Date(rl.resetAt).toISOString(),
      register: keyRecord ? undefined : `POST ${HOST}/register with {"email": "you@example.com"}`,
    }));
    return true;
  }

  let body = "";
  for await (const chunk of req) body += chunk;
  let args: unknown;
  try {
    args = body ? JSON.parse(body) : {};
  } catch {
    res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS, ...getRateLimitHeaders(rl) });
    res.end(JSON.stringify({ error: "Invalid JSON body.", spec: `${HOST}/openapi.json` }));
    return true;
  }

  const result = await executeRestTool(name, args, !!keyRecord);
  res.writeHead(result.status, { "Content-Type": "application/json", ...CORS_HEADERS, ...getRateLimitHeaders(rl) });
  res.end(JSON.stringify(result.body, null, 2));
  return true;
}
