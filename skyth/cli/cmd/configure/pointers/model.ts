import type {
	ConfigureTopicManifest,
	ConfigureHandler,
	ConfigureHandlerArgs,
} from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { loadConfig, saveConfig } from "@/config/loader";
import {
	parseModelRef,
	loadModelsDevCatalog,
} from "@/cli/cmd/configure/../../../providers/registry";
import { promptInput } from "@/cli/runtime_helpers";
import {
	autocomplete as clackAutocomplete,
	isCancel,
	text as clackText,
} from "@clack/prompts";
import { registry } from "@/cli/cmd/configure/registry";

export const MANIFEST: ConfigureTopicManifest = {
	id: "model",
	aliases: ["models"],
	description: "Set primary model",
};

const MODEL_ENTER_MANUAL = "__manual_model__";

function normalizeProviderID(value: string): string {
	return value.trim().replaceAll("-", "_");
}

async function selectModelWithClack(cfg: any): Promise<string | undefined> {
	const catalog = await loadModelsDevCatalog();
	const providers = Object.values(catalog)
		.map((provider) => ({
			id: normalizeProviderID(provider.id),
			label: provider.name?.trim() || provider.id,
			models: provider.models ?? {},
		}))
		.filter((provider) => provider.id);

	if (!providers.length) return undefined;

	const initialProvider = cfg.primary_model_provider || providers[0]!.id;
	const providerChoice = await clackAutocomplete<string>({
		message: "Model provider",
		options: providers.map((provider) => ({
			value: provider.id,
			label: provider.label,
		})),
		initialValue: initialProvider,
	});
	if (isCancel(providerChoice)) return undefined;
	const providerID = normalizeProviderID(String(providerChoice ?? ""));
	if (!providerID) return undefined;

	const provider = providers.find((p) => p.id === providerID);
	const modelOptions = Object.entries(provider?.models ?? {})
		.map(([modelID, modelDef]) => ({
			value: `${providerID}/${modelID}`,
			label: modelDef?.name?.trim() ? `${modelDef.name} (${modelID})` : modelID,
		}))
		.sort((a, b) =>
			a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
		);

	if (!modelOptions.length) {
		const manual = await clackText({
			message: "Primary model (provider/model)",
		});
		if (isCancel(manual)) return undefined;
		return String(manual ?? "").trim();
	}

	const modelChoice = await clackAutocomplete<string>({
		message: "Primary model",
		options: [
			...modelOptions.slice(0, 2500),
			{ value: MODEL_ENTER_MANUAL, label: "Enter model manually" },
		],
		initialValue: modelOptions[0]!.value,
	});
	if (isCancel(modelChoice)) return undefined;
	if (String(modelChoice) === MODEL_ENTER_MANUAL) {
		const manual = await clackText({
			message: "Primary model (provider/model)",
		});
		if (isCancel(manual)) return undefined;
		return String(manual ?? "").trim();
	}
	return String(modelChoice ?? "").trim();
}

async function handler({
	args,
	deps,
	useClack,
}: ConfigureHandlerArgs): Promise<{ exitCode: number; output: string }> {
	const cfg = deps.loadConfigFn();
	let rawModel = (args.model ?? args.value ?? "").trim();

	if (!rawModel && useClack) {
		rawModel = (await selectModelWithClack(cfg)) ?? "";
	}
	if (!rawModel) {
		rawModel =
			(await deps.promptInputFn("Primary model (provider/model): ")) ?? "";
	}
	const model = rawModel.trim();
	if (!model) return { exitCode: 1, output: "Error: model cannot be empty." };
	if (!model.includes("/")) {
		return {
			exitCode: 1,
			output: "Error: model must be in provider/model format.",
		};
	}

	const parsed = parseModelRef(model);
	cfg.primary_model = model;
	cfg.agents.defaults.model = model;
	if (parsed.providerID) cfg.primary_model_provider = parsed.providerID;
	await deps.saveConfigFn(cfg);
	return {
		exitCode: 0,
		output: [
			`Updated primary model: ${model}`,
			parsed.providerID
				? `Primary provider: ${parsed.providerID}`
				: "Primary provider unchanged.",
		].join("\n"),
	};
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
