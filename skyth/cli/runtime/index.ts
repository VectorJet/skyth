import type { CommandContext, CommandHandler } from "@/cli/runtime/types";
import { builtinRuntimeCommands, type RuntimeCommandManifest } from "./command_catalog";

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly manifests = new Map<string, RuntimeCommandManifest>();

  constructor() {
    for (const manifest of builtinRuntimeCommands) {
      this.registerManifest(manifest);
    }
  }

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  registerManifest(manifest: RuntimeCommandManifest): void {
    this.manifests.set(manifest.id, manifest);
    for (const alias of manifest.aliases ?? []) {
      this.manifests.set(alias, manifest);
    }
  }

  has(command: string): boolean {
    return this.handlers.has(command) || this.manifests.has(command);
  }

  async execute(command: string, ctx: CommandContext): Promise<number> {
    let handler = this.handlers.get(command);
    if (!handler) {
      const manifest = this.manifests.get(command);
      if (manifest) {
        handler = await manifest.load();
        this.handlers.set(manifest.id, handler);
        for (const alias of manifest.aliases ?? []) {
          this.handlers.set(alias, handler);
        }
      }
    }
    if (!handler) return 1;
    return await handler(ctx);
  }

  listCommands(): string[] {
    return Array.from(new Set([...this.manifests.keys(), ...this.handlers.keys()])).sort();
  }
}

export type { CommandContext, CommandHandler, RuntimeCommandManifest };
