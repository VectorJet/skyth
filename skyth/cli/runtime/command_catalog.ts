import type { CommandHandler } from "@/cli/runtime/types";

export interface RuntimeCommandManifest {
  id: string;
  aliases?: string[];
  load: () => Promise<CommandHandler>;
}

export const builtinRuntimeCommands: RuntimeCommandManifest[] = [
  { id: "run", load: async () => (await import("./commands/run")).runHandler },
  { id: "init", load: async () => (await import("./commands/init")).initHandler },
  { id: "onboard", load: async () => (await import("./commands/onboard")).onboardHandler },
  { id: "status", load: async () => (await import("./commands/status")).statusHandler },
  { id: "gateway", load: async () => (await import("./commands/gateway")).gatewayHandler },
  { id: "agent", load: async () => (await import("./commands/agent")).agentHandler },
  { id: "channels", load: async () => (await import("./commands/channels")).channelsHandler },
  { id: "cron", load: async () => (await import("./commands/cron")).cronHandler },
  { id: "pairing", load: async () => (await import("./commands/pairing")).pairingHandler },
  { id: "provider", load: async () => (await import("./commands/provider")).providerHandler },
  { id: "configure", load: async () => (await import("./commands/configure")).configureHandler },
  { id: "migrate", load: async () => (await import("./commands/migrate")).migrateHandler },
  { id: "auth", load: async () => (await import("./commands/auth")).authCommandHandler },
];
