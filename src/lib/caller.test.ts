import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runAsCaller, currentCaller } from "./caller.js";

// The per-caller spend cap only works if the caller survives the SDK's request
// handling all the way into the tool function. Prove it against the real SDK.
test("the caller set around handleRequest is visible inside a tool call", async () => {
  const mcp = new McpServer({ name: "t", version: "0" });
  mcp.registerTool("who", { inputSchema: { x: z.string().optional() } }, async () => ({
    content: [{ type: "text" as const, text: String(currentCaller()) }],
  }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await mcp.connect(transport);
  const http = createServer((req, res) => {
    runAsCaller("ip:9.9.9.9", () => transport.handleRequest(req, res));
  });
  await new Promise<void>((r) => http.listen(0, r));
  try {
    const port = (http.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "who", arguments: {} } }),
    });
    const json: any = await res.json();
    assert.equal(json.result.content[0].text, "ip:9.9.9.9");
  } finally {
    http.closeAllConnections();
    http.close();
  }
});
