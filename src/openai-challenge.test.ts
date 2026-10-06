import { test } from "node:test";
import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";

import { handleOpenAIChallenge, OPENAI_CHALLENGE_PATH } from "./openai-challenge.js";

function call(method: string, pathname: string, token?: string) {
  const before = process.env.OPENAI_APPS_CHALLENGE;
  if (token === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
  else process.env.OPENAI_APPS_CHALLENGE = token;

  const captured = { status: 0, headers: {} as Record<string, any>, body: undefined as any };
  const res = {
    writeHead(status: number, headers?: Record<string, any>) {
      captured.status = status;
      Object.assign(captured.headers, headers ?? {});
      return this;
    },
    end(chunk?: any) { captured.body = chunk; },
  } as unknown as ServerResponse;

  try {
    const handled = handleOpenAIChallenge({ method } as IncomingMessage, res, new URL(`http://localhost${pathname}`));
    return { handled, ...captured };
  } finally {
    if (before === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
    else process.env.OPENAI_APPS_CHALLENGE = before;
  }
}

test("the challenge answers with exactly the configured token, as plain text", () => {
  const r = call("GET", OPENAI_CHALLENGE_PATH, "  tok_abc123\n");
  assert.equal(r.handled, true);
  assert.equal(r.status, 200);
  assert.match(r.headers["Content-Type"], /^text\/plain/);
  // OpenAI compares the body to the token, so stray whitespace from pasting it
  // into a dashboard must not reach the response.
  assert.equal(r.body, "tok_abc123");
});

test("with no token configured the path 404s instead of answering empty", () => {
  const r = call("GET", OPENAI_CHALLENGE_PATH);
  assert.equal(r.handled, true);
  assert.equal(r.status, 404);
});

test("other paths are left to the rest of the server", () => {
  assert.equal(call("GET", "/.well-known/mcp/server.json", "tok").handled, false);
  assert.equal(call("GET", "/privacy", "tok").handled, false);
});
