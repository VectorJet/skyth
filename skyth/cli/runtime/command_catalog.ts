import type { CommandHandler } from "@/cli/runtime/types";

export interface RuntimeCommandManifest {
	id: string;
	aliases?: string[];
	load: () => Promise<CommandHandler>;
}

export const builtinRuntimeCommands: RuntimeCommandManifest[] = [
	{ id: "run", load: async () => (await import("./commands/run")).runHandler },
	{
		id: "init",
		load: async () => (await import("./commands/init")).initHandler,
	},
	{
		id: "onboard",
		load: async () => (await import("./commands/onboard")).onboardHandler,
	},
	{
		id: "status",
		load: async () => (await import("./commands/status")).statusHandler,
	},
	{
		id: "provider",
		load: async () => (await import("./commands/provider")).providerHandler,
	},
	{
		id: "gateway",
		load: async () => (await import("./commands/gateway")).gatewayHandler,
	},
	{
		id: "channels",
		load: async () => (await import("./commands/channels")).channelsHandler,
	},
	{
		id: "configure",
		load: async () => (await import("./commands/configure")).configureHandler,
	},
	{
		id: "cron",
		load: async () => (await import("./commands/cron")).cronHandler,
	},
	{
		id: "migrate",
		load: async () => (await import("./commands/migrate")).migrateHandler,
	},
	{
		id: "pairing",
		load: async () => (await import("./commands/pairing")).pairingHandler,
	},
];
