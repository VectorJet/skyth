import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cronAddCommand } from "../skyth/cli/commands";

describe("cron commands", () => {
  test("cron add rejects invalid timezone", () => {
    const base = join(process.cwd(), ".tmp", `croncmd-${Date.now()}`);
    const result = cronAddCommand({
      name: "demo",
      message: "hello",
      cron: "0 9 * * *",
      tz: "America/Vancovuer",
    }, { dataDir: base });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Error: unknown timezone 'America/Vancovuer'");
    expect(existsSync(join(base, "cron", "jobs.json"))).toBeFalse();
  });
});
