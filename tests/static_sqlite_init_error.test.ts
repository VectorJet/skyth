import { describe, expect, test, mock } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { readFileSync, existsSync } from "node:fs";

mock.module("bun:sqlite", () => {
  return {
    Database: class {
      constructor() {
        throw new Error("Mock SQLite Init Error");
      }
      prepare() { return { all: () => [], run: () => {} }; }
      exec() {}
    },
  };
});

import { StaticSqliteMemoryBackend } from "../skyth/memory/backends/static_sqlite";

function makeDir(prefix: string): string {
  const path = join(tmpdir(), `${prefix}-${randomUUID()}`);
  mkdirSync(path, { recursive: true });
  return path;
}

describe("StaticSqliteMemoryBackend Init Error", () => {
  test("constructor handles SQLite initialization error gracefully", () => {
    const workspace = makeDir("skyth-test-error");

    expect(() => {
      new StaticSqliteMemoryBackend(workspace);
    }).not.toThrow();
  });

  test("methods handle missing database gracefully", () => {
    const workspace = makeDir("skyth-test-methods");
    const backend = new StaticSqliteMemoryBackend(workspace);

    // recordEvent should not throw
    expect(() => {
      backend.recordEvent({
        kind: "event",
        scope: "test",
        action: "test",
        summary: "test event"
      });
    }).not.toThrow();

    // writeDailySummary should not throw and create a fallback file
    const date = "2026-02-24";
    const result = backend.writeDailySummary(date);
    expect(result.eventCount).toBe(0);
    expect(existsSync(result.path)).toBeTrue();
    const content = readFileSync(result.path, "utf-8");
    expect(content).toContain("Database unavailable");
  });
});
