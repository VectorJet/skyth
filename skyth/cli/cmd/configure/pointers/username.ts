import type {
	ConfigureTopicManifest,
	ConfigureHandler,
	ConfigureHandlerArgs,
} from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { loadConfig, saveConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import { promptInput } from "@/cli/runtime_helpers";
import {
	autocomplete as clackAutocomplete,
	cancel as clackCancel,
	isCancel,
	password as clackPassword,
	text as clackText,
} from "@clack/prompts";
import { registry } from "@/cli/cmd/configure/registry";

export const MANIFEST: ConfigureTopicManifest = {
	id: "username",
	description: "Set account username",
};

async function promptTextValue(
	message: string,
	deps: Required<
		Pick<ConfigureDeps, "loadConfigFn" | "saveConfigFn" | "promptInputFn">
	>,
	useClack: boolean,
): Promise<string | undefined> {
	if (!useClack) {
		return (await deps.promptInputFn(message)).trim();
	}
	const value = await clackText({ message });
	if (isCancel(value)) return undefined;
	return String(value ?? "").trim();
}

async function handler({
	args,
	deps,
	useClack,
}: ConfigureHandlerArgs): Promise<{ exitCode: number; output: string }> {
	const cfg = deps.loadConfigFn();
	const raw =
		(args.value ?? "").trim() ||
		(await promptTextValue("Username", deps, useClack));
	if (raw === undefined) return { exitCode: 1, output: "Cancelled." };
	const username = raw.trim();
	if (!username)
		return { exitCode: 1, output: "Error: username cannot be empty." };
	cfg.username = username;
	deps.saveConfigFn(cfg);
	return { exitCode: 0, output: `Updated username: ${username}` };
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
