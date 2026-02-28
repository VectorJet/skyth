import type { CommandContext, CommandHandler, CommandSpec } from "@/cli/runtime/types";
import { runHandler } from "./commands/run";
import { initHandler } from "./commands/init";
import { onboardHandler } from "./commands/onboard";
import { statusHandler } from "./commands/status";
import { gatewayHandler } from "./commands/gateway";
import { agentHandler } from "./commands/agent";
import { channelsHandler } from "./commands/channels";
import { cronHandler } from "./commands/cron";
import { pairingHandler } from "./commands/pairing";
import { providerHandler } from "./commands/provider";
import { configureHandler } from "./commands/configure";
import { migrateHandler } from "./commands/migrate";
import { authCommandHandler as authHandler } from "./commands/auth";

const COMMANDS: CommandSpec[] = [
  { name: "run", handler: runHandler },
  { name: "init", handler: initHandler },
  { name: "onboard", handler: onboardHandler },
  { name: "status", handler: statusHandler },
  { name: "gateway", handler: gatewayHandler },
  { name: "agent", handler: agentHandler },
  { name: "channels", handler: channelsHandler },
  { name: "cron", handler: cronHandler },
  { name: "pairing", handler: pairingHandler },
  { name: "provider", handler: providerHandler },
  { name: "configure", handler: configureHandler },
  { name: "migrate", handler: migrateHandler },
  { name: "auth", handler: authHandler },
];

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  constructor() {
    for (const cmd of COMMANDS) {
      this.handlers.set(cmd.name, cmd.handler);
    }
  }

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }

  async execute(command: string, ctx: CommandContext): Promise<number> {
    const handler = this.handlers.get(command);
    if (!handler) return 1;
    return await handler(ctx);
  }

  listCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export { runHandler, initHandler, onboardHandler, statusHandler, gatewayHandler, agentHandler, channelsHandler, cronHandler, pairingHandler, providerHandler, configureHandler, migrateHandler, authHandler };
export type { CommandContext, CommandHandler, CommandSpec };
