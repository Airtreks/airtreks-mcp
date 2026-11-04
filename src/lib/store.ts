/**
 * Simple JSON file store.
 * Reads/writes to DATA_DIR, /data/ (Railway volume), or ~/.airtreks-mcp/
 * (stdio/npx installs, where /data isn't creatable).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
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

export type ReadState<T> = { status: "missing" } | { status: "ok"; data: T } | { status: "corrupt" };

/**
 * Read a JSON file, telling a missing file apart from a corrupt one. A corrupt
 * file is moved aside (never deleted) so a caller that falls back to defaults
 * and saves cannot destroy the only copy of its data (AIR-1311).
 */
export function readJsonState<T>(filename: string): ReadState<T> {
  ensureDir();
  const path = join(DATA_DIR, filename);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return { status: "missing" };
  }
  try {
    return { status: "ok", data: JSON.parse(raw) };
  } catch {
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`);
    } catch {
      // best effort: the caller still treats this as corrupt
    }
    console.error(`[store] ${filename} was corrupt; moved aside`);
    return { status: "corrupt" };
  }
}

export function readJson<T>(filename: string, fallback: T): T {
  const r = readJsonState<T>(filename);
  return r.status === "ok" ? r.data : fallback;
}

/** Write via a temp file and rename, so a crash mid-write never leaves a torn file. */
export function writeJson(filename: string, data: unknown) {
  ensureDir();
  const path = join(DATA_DIR, filename);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}
