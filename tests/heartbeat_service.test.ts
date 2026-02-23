import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HeartbeatService, HEARTBEAT_OK_TOKEN } from "../skyth/heartbeat";

describe("heartbeat service", () => {
  test("returns HEARTBEAT_OK when HEARTBEAT.md is empty", async () => {
    const workspace = join(process.cwd(), ".tmp", `hb-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "HEARTBEAT.md"), "# header\n", "utf-8");

    const service = new HeartbeatService({ workspace, interval_s: 60, on_heartbeat: async () => "NO" });
    const result = await service.tick();
    expect(result).toBe(HEARTBEAT_OK_TOKEN);
  });

  test("calls on_heartbeat when HEARTBEAT.md has actionable content", async () => {
    const workspace = join(process.cwd(), ".tmp", `hb-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "HEARTBEAT.md"), "check pending tasks", "utf-8");

    const service = new HeartbeatService({ workspace, interval_s: 60, on_heartbeat: async () => "done" });
    const result = await service.tick();
    expect(result).toBe("done");
  });
});
