import type { CommandHandler } from "../command_registry";
import type { ParsedArgs } from "../runtime_helpers";

export { runCommandHandler } from "./run";
export { initCommandHandler } from "./init";
export { onboardCommandHandler } from "./onboard";
export { statusCommandHandler } from "./status";
export { gatewayCommandHandler } from "./gateway";
export { agentCommandHandler } from "./agent";
export { channelsCommandHandler } from "./channels";
export { cronCommandHandler } from "./cron";
export { pairingCommandHandler } from "./pairing";
export { providerCommandHandler } from "./provider";
export { configureCommandHandler } from "./configure";
export { migrateCommandHandler } from "./migrate";
export { authCommandHandler } from "./auth";

export type { CommandHandler };

export interface CommandModule {
  name: string;
  handler: (parsed: ParsedArgs) => Promise<number> | number;
}

export const commands: CommandModule[] = [
  { name: "run", handler: (parsed) => import("./run").then((m) => m.runCommandHandler(parsed)) },
  { name: "init", handler: (parsed) => import("./init").then((m) => m.initCommandHandler(parsed)) },
  { name: "onboard", handler: (parsed) => import("./onboard").then((m) => m.onboardCommandHandler(parsed)) },
  { name: "status", handler: () => import("./status").then((m) => m.statusCommandHandler()) },
  { name: "gateway", handler: (parsed) => import("./gateway").then((m) => m.gatewayCommandHandler(parsed)) },
  { name: "agent", handler: (parsed) => import("./agent").then((m) => m.agentCommandHandler(parsed)) },
  { name: "channels", handler: (parsed) => import("./channels").then((m) => m.channelsCommandHandler(parsed)) },
  { name: "cron", handler: (parsed) => import("./cron").then((m) => m.cronCommandHandler(parsed)) },
  { name: "pairing", handler: (parsed) => import("./pairing").then((m) => m.pairingCommandHandler(parsed)) },
  { name: "provider", handler: (parsed) => import("./provider").then((m) => m.providerCommandHandler(parsed)) },
  { name: "configure", handler: (parsed) => import("./configure").then((m) => m.configureCommandHandler(parsed)) },
  { name: "migrate", handler: (parsed) => import("./migrate").then((m) => m.migrateCommandHandler(parsed)) },
  { name: "auth", handler: (parsed) => import("./auth").then((m) => m.authCommandHandler(parsed)) },
];
