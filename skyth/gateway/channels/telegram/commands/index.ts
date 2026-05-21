/**
 * Slash-command loader. Each *.cmd.ts file in this directory exports a
 * default SlashCommand. They are registered against the Telegram channel at
 * startup (no BotFather configuration needed — setMyCommands publishes them).
 *
 * Add a new command by dropping a file:
 *
 *   // workspace.cmd.ts
 *   export default {
 *     name: 'workspace',
 *     description: 'Print workspace path',
 *     handler: async ({ reply, ctx }) => reply(ctx.workspace.root),
 *   } satisfies SlashCommand;
 */
import { readdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Channel, SlashCommand } from "@/gateway/channels/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function loadAndRegisterCommands(
	channel: Channel,
): Promise<SlashCommand[]> {
	const out: SlashCommand[] = [];
	let entries: string[] = [];
	try {
		entries = await readdir(HERE);
	} catch {
		return out;
	}
	for (const name of entries) {
		if (!name.endsWith(".cmd.ts") && !name.endsWith(".cmd.js")) continue;
		try {
			const mod = await import(join(HERE, name));
			const cmd: SlashCommand = mod.default;
			if (!cmd?.name || !cmd.handler) continue;
			channel.registerCommand(cmd);
			out.push(cmd);
		} catch (err) {
			console.warn(`[commands] failed to load ${name}:`, err);
		}
	}
	return out;
}
