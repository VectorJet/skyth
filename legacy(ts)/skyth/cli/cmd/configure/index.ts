import {
	intro as clackIntro,
	outro as clackOutro,
	cancel as clackCancel,
} from "@clack/prompts";
import { loadConfig, saveConfig } from "@/cli/cmd/../../config/loader";
import type { Config } from "@/cli/cmd/../../config/schema";
import { listProviderSpecs } from "@/cli/cmd/../../providers/registry";
import {
	chooseProviderInteractive,
	promptInput,
} from "@/cli/cmd/../runtime_helpers";
import { getConfigureRegistry } from "@/cli/cmd/configure/pointers";
import "./pointers";

export interface ConfigureArgs {
	topic?: string;
	value?: string;
	provider?: string;
	api_key?: string;
	api_base?: string;
	model?: string;
	primary?: boolean;
	channel?: string;
	enable?: boolean;
	disable?: boolean;
	set?: string;
	json?: string;
}

export interface ConfigureDeps {
	loadConfigFn?: () => Config;
	saveConfigFn?: (cfg: Config) => Promise<void>;
	promptInputFn?: (prompt: string) => Promise<string>;
	promptPasswordFn?: (prompt: string) => Promise<string>;
	chooseProviderFn?: (providerIDs: string[]) => Promise<string | undefined>;
	listProviderSpecsFn?: typeof listProviderSpecs;
	writeSuperuserPasswordRecordFn?: (
		password: string,
	) => Promise<{ path: string }>;
}

function usage(): string {
	return [
		"Usage: skyth configure TOPIC [VALUE] [options]",
		"",
		"Topics:",
		"  username      Set account username",
		"  password      Set superuser password",
		"  provider      Configure provider credentials",
		"  providers     Alias for provider",
		"  model         Set primary model",
		"  models        Alias for model",
		"  channels      Configure a channel (requires superuser if previously configured)",
		"  channel       Alias for channels",
		"  web-search    Configure web search providers",
		"",
		"Examples:",
		"  skyth configure username tammy",
		"  skyth configure password --value my-secret",
		"  skyth configure provider openai --api-key sk-...",
		"  skyth configure provider --provider groq --api-key gsk-...",
		"  skyth configure model groq/moonshotai/kimi-k2-instruct-0905",
		'  skyth configure channels telegram --json \'{"token":"bot123"}\'',
		"  skyth configure channels telegram --enable",
		"  skyth configure web-search exa --api-key sk-...",
		"  skyth configure web-search brave --api-key BRAVE_API_KEY",
	].join("\n");
}

function shouldUseClack(deps?: ConfigureDeps): boolean {
	if (deps?.promptInputFn || deps?.promptPasswordFn || deps?.chooseProviderFn)
		return false;
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function configureCommand(
	args: ConfigureArgs,
	deps?: ConfigureDeps,
): Promise<{ exitCode: number; output: string }> {
	const topic = String(args.topic ?? "")
		.trim()
		.toLowerCase();
	if (!topic || topic === "help") return { exitCode: 0, output: usage() };
	const useClack = shouldUseClack(deps);

	const registry = getConfigureRegistry();
	const topicHandler = registry.resolve(topic);

	if (!topicHandler) {
		return {
			exitCode: 1,
			output: `Error: unknown configure topic '${topic}'.\n\n${usage()}`,
		};
	}

	const injected = {
		loadConfigFn: deps?.loadConfigFn ?? loadConfig,
		saveConfigFn:
			deps?.saveConfigFn ?? (async (cfg: Config) => await saveConfig(cfg)),
		promptInputFn: deps?.promptInputFn ?? promptInput,
		chooseProviderFn: deps?.chooseProviderFn ?? chooseProviderInteractive,
		listProviderSpecsFn: deps?.listProviderSpecsFn ?? listProviderSpecs,
		writeSuperuserPasswordRecordFn:
			deps?.writeSuperuserPasswordRecordFn ??
			(async (p: string) => {
				const { writeSuperuserPasswordRecord } = await import(
					"../../../auth/superuser"
				);
				return writeSuperuserPasswordRecord(p);
			}),
	};

	if (useClack) clackIntro("Skyth configure");

	try {
		const result = await topicHandler.handler({
			args,
			deps: injected,
			useClack,
		});

		if (useClack) {
			if (result.exitCode === 0) {
				clackOutro(result.output.split("\n")[0] ?? "Configured.");
			} else if (result.output === "Cancelled.") {
				clackCancel("Configuration cancelled.");
			}
		}

		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (useClack) clackCancel(message);
		return { exitCode: 1, output: `Error: ${message}` };
	}
}
