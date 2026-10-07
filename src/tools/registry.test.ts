import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, toolAnnotations, toolMeta } from "./registry.js";

test("every tool tells ChatGPT what it is doing while it runs (AIR-1108)", () => {
  for (const tool of TOOLS) {
    const meta = toolMeta(tool);
    for (const key of ["openai/toolInvocation/invoking", "openai/toolInvocation/invoked"]) {
      const text = meta[key];
      assert.equal(typeof text, "string", `${tool.name} ${key}`);
      // OpenAI caps both at 64 characters.
      assert.ok((text as string).length > 0 && (text as string).length <= 64, `${tool.name} ${key}: "${text}"`);
    }
  }
});

test("every tool carries the three hints ChatGPT requires", () => {
  for (const tool of TOOLS) {
    const hints = toolAnnotations(tool);
    for (const key of ["readOnlyHint", "destructiveHint", "openWorldHint"] as const) {
      assert.equal(typeof hints[key], "boolean", `${tool.name} ${key}`);
    }
    // Only the consultant handoff sends anything that cannot be recalled.
    assert.equal(hints.destructiveHint, tool.name === "trip_idea_create", tool.name);
  }
});

test("only the consultant handoff is flagged as acting outside the conversation", () => {
  // An annotation that disagrees with what a tool does is a listed rejection reason.
  const writers = TOOLS.filter((t) => !toolAnnotations(t).readOnlyHint).map((t) => t.name);
  assert.deepEqual(writers, ["trip_idea_create"]);
});

test("every tool is declared callable without an account", () => {
  for (const tool of TOOLS) {
    // A tool gated again through requiresKey would need a real scheme, not noauth.
    assert.equal(tool.requiresKey, false, tool.name);
    assert.deepEqual(toolMeta(tool).securitySchemes, [{ type: "noauth" }], tool.name);
  }
});
