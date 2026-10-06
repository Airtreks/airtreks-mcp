/**
 * The OpenAI plugin package in chatgpt-plugin/ (AIR-1108), checked against the
 * limits OpenAI's upload and review apply, so a bad edit fails here rather than
 * a week into a review. Limits from developers.openai.com/plugins/deploy/submission
 * and /submission-errors, read 2026-10-06.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TOOLS } from "./tools/registry.js";

const root = (path: string) => fileURLToPath(new URL(`../chatgpt-plugin/${path}`, import.meta.url));
const manifest = JSON.parse(readFileSync(root("plugin.json"), "utf8"));
const mcp = JSON.parse(readFileSync(root("mcp.json"), "utf8"));
const openai = manifest.extensions["com.openai"];
const ui = openai.interface;
const cases = openai.review.test_cases;

const CATEGORIES = [
  "Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics",
  "Communication", "Education & Research", "Security", "Finance", "Healthcare", "Travel",
  "Entertainment", "Other",
];

test("the package identity is what an upload accepts", () => {
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  // The submission-errors page caps this at 1,024 even though the field
  // reference says 4,000; the lower one is the one that can block an upload.
  assert.ok(manifest.description.length <= 1024);
});

test("the listing text fits the directory's limits", () => {
  assert.ok(ui.displayName.length <= 30, ui.displayName);
  assert.ok(ui.shortDescription.length <= 30, ui.shortDescription);
  assert.ok(ui.longDescription.length <= 4000);
  assert.ok(ui.developerName.length <= 80);
  assert.ok(CATEGORIES.includes(ui.category), ui.category);
  assert.ok(ui.capabilities.length <= 20 && ui.capabilities.every((c: string) => c.length <= 120));
  // Directory rule: no pricing, trials or promotions of the plugin itself.
  assert.doesNotMatch(ui.longDescription, /\bfree\b/i);
});

test("all four listing URLs are HTTPS", () => {
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    assert.match(ui[key], /^https:\/\/[^@\s]+$/, key);
  }
});

test("starter prompts are at most three, unique, short and free of @mentions", () => {
  const prompts: string[] = ui.defaultPrompt;
  assert.ok(prompts.length >= 1 && prompts.length <= 3);
  assert.equal(new Set(prompts.map((p) => p.trim().toLowerCase())).size, prompts.length);
  for (const p of prompts) {
    assert.ok(p.length <= 128 && !p.includes("\n") && !p.includes("@"), p);
  }
});

test("every referenced image exists and is a square PNG the directory accepts", () => {
  // Screenshots are rejected for a plugin with no UI (screenshots_not_allowed).
  assert.equal(ui.screenshots, undefined);
  for (const key of ["logo", "logoDark", "composerIcon", "composerIconDark"]) {
    const path = ui[key];
    assert.match(path, /^\.\//, key);
    const file = root(path.slice(2));
    assert.ok(existsSync(file), `${key}: ${path}`);
    assert.ok(statSync(file).size <= 5 * 1024 * 1024);
    const head = readFileSync(file).subarray(0, 24);
    assert.equal(head.subarray(1, 4).toString(), "PNG", key);
    const width = head.readUInt32BE(16);
    const height = head.readUInt32BE(20);
    assert.ok(width === height && width >= 48 && width <= 4096, `${key}: ${width}x${height}`);
  }
});

test("the light brand colour has the 2:1 contrast against white the upload checks", () => {
  const channel = (hex: string) => {
    const c = parseInt(hex, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(ui.brandColor.slice(i, i + 2)));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  assert.ok(1.05 / (luminance + 0.05) >= 2, ui.brandColor);
});

test("the review cases are exactly five positive and three negative", () => {
  assert.equal(cases.positive.length, 5);
  assert.equal(cases.negative.length, 3);
  for (const c of [...cases.positive, ...cases.negative]) {
    assert.ok(c.description && c.prompt, JSON.stringify(c));
  }
  for (const c of cases.positive) assert.ok(c.tools_triggered && c.expected_behavior, c.description);
  // The upload rejects these; reviewer access goes in the dashboard form.
  assert.equal(openai.review.test_credentials, undefined);
  assert.equal(openai.review.reviewer_instructions, undefined);
});

test("positive cases name real tools, and none sends a lead to a consultant", () => {
  const names = new Set(TOOLS.map((t) => t.name));
  for (const c of cases.positive) {
    for (const tool of c.tools_triggered.split(",").map((s: string) => s.trim())) {
      assert.ok(names.has(tool), `${c.description}: ${tool}`);
      // Reviewers run these against production, so a trip_idea_create case
      // would put reviewer leads in front of real consultants.
      assert.notEqual(tool, "trip_idea_create");
    }
  }
});

test("the dates in the review prompts are still in the future", () => {
  // Reviewers rerun these on every submission. A past date fails the fare
  // tools, so refresh the dates in chatgpt-plugin/plugin.json when this fails.
  const today = new Date().toISOString().slice(0, 10);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (const c of cases.positive) {
    const year = c.prompt.match(/\b(20\d\d)\b/)?.[1];
    for (const m of c.prompt.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})\b/g)) {
      const date = `${year}-${String(months.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      assert.ok(date > today, `${c.description}: ${date} is not after ${today}`);
    }
  }
});

test("the package points at the one hosted MCP server", () => {
  assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
  const servers = Object.values(mcp.mcpServers) as { type: string; url: string }[];
  assert.equal(servers.length, 1, "plugin-level review cases require exactly one server");
  assert.deepEqual(servers[0], { type: "streamable-http", url: "https://mcp.airtreks.com/mcp" });
});
