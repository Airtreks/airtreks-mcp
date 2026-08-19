/**
 * Simple JSON file store.
 * Reads/writes to DATA_DIR, /data/ (Railway volume), or ~/.airtreks-mcp/
 * (stdio/npx installs, where /data isn't creatable).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// /data is the Railway volume; npx/stdio users can't create it, and the
// EACCES from mkdir crashed the server at import (AIR-801). Fall back to a
// per-user directory.
function resolveDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    mkdirSync("/data", { recursive: true });
    return "/data";
  } catch {
    return join(homedir(), ".airtreks-mcp");
  }
}

const DATA_DIR = resolveDataDir();

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readJson<T>(filename: string, fallback: T): T {
  ensureDir();
  const path = join(DATA_DIR, filename);
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

export function writeJson(filename: string, data: unknown) {
  ensureDir();
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
}
