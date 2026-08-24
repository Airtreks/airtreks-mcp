import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";

import { handleFavicon } from "./favicon.js";
import { PRIVACY_HTML } from "./privacy.js";

function call(method: string, pathname: string) {
  const captured = { status: 0, headers: {} as Record<string, any>, body: undefined as any };
  const res = {
    writeHead(status: number, headers?: Record<string, any>) {
      captured.status = status;
      Object.assign(captured.headers, headers ?? {});
      return this;
    },
    end(chunk?: any) { captured.body = chunk; },
  } as unknown as ServerResponse;

  const handled = handleFavicon({ method } as IncomingMessage, res, new URL(`http://localhost${pathname}`));
  return { handled, ...captured };
}

test("GET /favicon.ico serves the shipped icon as an icon", () => {
  const r = call("GET", "/favicon.ico");
  assert.equal(r.handled, true);
  assert.equal(r.status, 200);
  assert.match(r.headers["Content-Type"], /icon/);
  // ICO header: reserved 0x0000, type 1 (icon).
  assert.deepEqual([...(r.body as Buffer).subarray(0, 4)], [0, 0, 1, 0]);
  assert.equal(r.headers["Content-Length"], (r.body as Buffer).length);
});

test("GET /favicon.svg serves the AirTreks mark", () => {
  const r = call("GET", "/favicon.svg");
  assert.equal(r.handled, true);
  assert.equal(r.status, 200);
  assert.equal(r.headers["Content-Type"], "image/svg+xml");
  const svg = (r.body as Buffer).toString("utf8");
  assert.match(svg, /^<svg/);
  assert.match(svg, /#00a2d9/, "the brand blue is the whole point of serving our own icon");
});

test("both icons are the bytes on disk, cached for a day", () => {
  for (const file of ["favicon.ico", "favicon.svg"]) {
    const r = call("GET", `/${file}`);
    const onDisk = readFileSync(new URL(`../public/${file}`, import.meta.url));
    assert.ok(onDisk.equals(r.body as Buffer), `${file} must be served verbatim`);
    assert.equal(r.headers["Cache-Control"], "public, max-age=86400");
  }
});

test("HEAD answers with the headers and no body", () => {
  const r = call("HEAD", "/favicon.ico");
  assert.equal(r.status, 200);
  assert.equal(r.body, undefined);
  assert.ok(r.headers["Content-Length"] > 0);
});

test("a write method is rejected, not treated as a fetch", () => {
  const r = call("POST", "/favicon.ico");
  assert.equal(r.handled, true);
  assert.equal(r.status, 405);
  assert.equal(r.headers["Allow"], "GET, HEAD");
});

test("every other path falls through to the rest of the router", () => {
  for (const pathname of ["/", "/mcp", "/health", "/favicon.png", "/api/plan_route"]) {
    assert.equal(call("GET", pathname).handled, false, `${pathname} must not be swallowed`);
  }
});

test("the icons ship in the package the hosted deployment installs", () => {
  // dist/ is compiled, but public/ is copied verbatim: it reaches the hosted
  // server only because package.json "files" lists it. Drop that and
  // mcp.airtreks.com 404s the favicon again with nothing else failing.
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.files.includes("public"), '"files" must include public/');
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /COPY public\//, "the runtime image needs public/ next to dist/");
});

test("the privacy page links the favicon for crawlers that read HTML", () => {
  assert.match(PRIVACY_HTML, /<link rel="icon" href="\/favicon\.svg"/);
  assert.match(PRIVACY_HTML, /<link rel="icon" href="\/favicon\.ico"/);
});
