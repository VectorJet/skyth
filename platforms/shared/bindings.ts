import { spawn, type ChildProcess } from "node:child_process";
import httpProxy = require("http-proxy");
import type { WebUiConfig } from "./types";

export interface WebUiBinding {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
}

export function createWebUiBinding(
  config: WebUiConfig,
  gatewayPort: number,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): WebUiBinding {
  let proc: ChildProcess | null = null;
  let running = false;

  return {
    async start(): Promise<void> {
      if (!config.enabled) {
        logger.info("webui disabled in config");
        return;
      }

      if (running) {
        logger.warn("webui already running");
        return;
      }

      logger.info(`starting webui at ${config.path} on port ${config.port}`);

      proc = spawn("bun", ["run", "dev"], {
        cwd: config.path,
        stdio: "pipe",
        env: {
          ...process.env,
          SKYTH_GATEWAY_URL: `http://localhost:${gatewayPort}`,
          SKYTH_GATEWAY_PORT: String(gatewayPort),
          PORT: String(config.port),
        },
      });

      proc.on("spawn", () => {
        running = true;
        logger.info("webui started");
      });

      proc.on("error", (err) => {
        logger.error(`webui failed to start: ${err.message}`);
        running = false;
      });

      proc.on("exit", (code) => {
        if (code !== 0) {
          logger.warn(`webui exited with code ${code}`);
        }
        running = false;
      });
    },

    async stop(): Promise<void> {
      if (proc && running) {
        proc.kill("SIGTERM");
        running = false;
        logger.info("webui stopped");
      }
    },

    isRunning(): boolean {
      return running;
    },
  };
}

export function createGatewayProxy(gatewayPort: number, _webUiPort: number): httpProxy {
  return httpProxy.createProxyServer({
    target: `http://localhost:${gatewayPort}`,
    ws: true,
  });
}
