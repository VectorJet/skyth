import type {
	ConfigureTopicManifest,
	ConfigureHandler,
	ConfigureHandlerArgs,
} from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { loadConfig, saveConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import { listProviderSpecs } from "@/cli/cmd/configure/../../../providers/registry";
import { chooseProviderInteractive, promptInput } from "@/cli/runtime_helpers";
import {
	autocomplete as clackAutocomplete,
	isCancel,
	password as clackPassword,
} from "@clack/prompts";
import { registry } from "@/cli/cmd/configure/registry";

export const MANIFEST: ConfigureTopicManifest = {
	id: "provider",
	aliases: ["providers"],
	description: "Configure provider credentials",
};

function normalizeProviderID(value: string): string {
	return value.trim().replaceAll("-", "_");
}

async function resolveProviderID(
	args: ConfigureArgs,
	deps: Required<
		Pick<ConfigureDeps, "chooseProviderFn" | "listProviderSpecsFn">
	>,
	useClack: boolean,
): Promise<string | undefined> {
	const specs = await deps.listProviderSpecsFn({ includeDynamic: true });
	const providerIDs = specs.map((s) => s.name).sort();
	const fromArg = normalizeProviderID(args.provider ?? args.value ?? "");
	if (fromArg && providerIDs.includes(fromArg)) return fromArg;
	if (fromArg && !providerIDs.includes(fromArg)) return undefined;
	if (useClack) {
		const value = await clackAutocomplete<string>({
			message: "Provider",
			options: providerIDs.map((id) => ({ value: id, label: id })),
			initialValue: providerIDs[0] || "openai",
		});
		if (isCancel(value)) return undefined;
		return normalizeProviderID(String(value ?? ""));
	}
	return await deps.chooseProviderFn(providerIDs);
}

async function handler({
	args,
	deps,
	useClack,
}: ConfigureHandlerArgs): Promise<{ exitCode: number; output: string }> {
	const providerID = await resolveProviderID(args, deps as any, useClack);
	if (!providerID)
		return { exitCode: 1, output: "Error: provider is required." };

	const cfg = deps.loadConfigFn();
	const providers = cfg.providers as Record<
		string,
		{ api_key?: string; api_base?: string }
	>;
	const provider = providers[providerID] ?? { api_key: "" };
	providers[providerID] = provider;

	async function promptValue(message: string, secret = false): Promise<string> {
		if (!useClack) {
			const val = await deps.promptInputFn(message);
			return secret ? val.trim() : val.trim();
		}
		const { isCancel: isCancelFn } = await import("@clack/prompts");
		const input = secret
			? await clackPassword({ message, mask: "*" })
			: await import("@clack/prompts").then((m) => m.text({ message }));
		if (isCancelFn(input)) return "";
		return String(input ?? "").trim();
	}

	const apiKey =
		(args.api_key ?? "").trim() ||
		(await promptValue(
			`API key for ${providerID} (leave blank to keep current)`,
			true,
		)) ||
		"";
	const apiBase = (args.api_base ?? "").trim();
	if (apiKey) provider.api_key = apiKey;
	if (apiBase) provider.api_base = apiBase;
	if (args.primary) cfg.primary_model_provider = providerID;

	deps.saveConfigFn(cfg);

	const lines = [`Configured provider: ${providerID}`];
	lines.push(apiKey ? "API key updated." : "API key unchanged.");
	if (apiBase) lines.push(`API base set: ${apiBase}`);
	if (args.primary) lines.push("Marked as primary provider.");
	return { exitCode: 0, output: lines.join("\n") };
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
