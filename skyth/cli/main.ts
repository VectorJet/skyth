import {
	ensureDataDir,
	parseArgs,
	usage,
	boolFlag,
} from "@/cli/runtime_helpers";
import { CommandRegistry } from "@/cli/runtime";

(globalThis as any).AI_SDK_LOG_WARNINGS = false;
async function main(): Promise<number> {
	const parsed = parseArgs(process.argv.slice(2));
	const { positionals, flags } = parsed;

	if (flags.version || flags.v) {
		console.log("skyth v0.1.0");
		return 0;
	}

	if (positionals.length === 0 || positionals[0] === "help" || flags.help) {
		console.log(usage());
		return 0;
	}

	const cmd = positionals[0]!;
	ensureDataDir();

	const registry = new CommandRegistry();

	if (!registry.has(cmd)) {
		console.error(`Error: unknown command '${positionals.join(" ")}'`);
		console.log(usage());
		return 1;
	}

	return await registry.execute(cmd, { positionals, flags });
}

const code = await main();
process.exit(code);
