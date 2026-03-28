import type { GatewayClient } from "@/gateway/protocol";
import {
	listProviderSpecs,
	loadModelsDevCatalog,
	type ProviderSpec,
	type ModelsDevProvider,
} from "@/providers/registry";

export interface ModelsHandlerDeps {
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
	getSelectedModel: () => string | null;
	setSelectedModel: (model: string) => void;
}

export interface ModelEntry {
	id: string;
	name: string;
	provider: string;
	providerDisplayName?: string;
	contextWindow?: number;
	maxOutput?: number;
	isGateway?: boolean;
}

export interface ModelsCatalogResult {
	providers: Array<{
		name: string;
		displayName?: string;
		envKey: string;
		models: ModelEntry[];
	}>;
	totalModels: number;
	totalProviders: number;
}

export interface ModelsSelectedResult {
	model: string | null;
	modelId: string;
	providerId: string;
}

export interface ModelsSelectResult {
	ok: boolean;
	model: string;
	modelId: string;
	providerId: string;
}

async function loadCatalogData(): Promise<Record<string, ModelsDevProvider>> {
	try {
		return await loadModelsDevCatalog({ disableFetch: true });
	} catch {
		return {};
	}
}

function mergeProviderModels(
	spec: ProviderSpec,
	models: Record<string, ModelsDevProvider>,
): ModelEntry[] {
	const entries: ModelEntry[] = [];

	// Add models from the dynamic catalog
	const providerModels = models[spec.name.replaceAll("_", "-")];
	if (providerModels) {
		for (const [modelId, modelData] of Object.entries(providerModels.models)) {
			entries.push({
				id: modelId,
				name: modelData.name ?? modelId,
				provider: spec.name,
				providerDisplayName: spec.display_name,
				contextWindow: modelData.limit?.context,
				maxOutput: modelData.limit?.output,
				isGateway: spec.is_gateway,
			});
		}
	}

	// If no dynamic models, add a default entry for providers without dynamic catalog
	if (entries.length === 0 && spec.name) {
		entries.push({
			id: spec.name,
			name: spec.display_name ?? spec.name,
			provider: spec.name,
			providerDisplayName: spec.display_name,
			isGateway: spec.is_gateway,
		});
	}

	return entries;
}

export function createModelsHandlers(deps: ModelsHandlerDeps) {
	const { getAuthenticatedNode, getSelectedModel, setSelectedModel } = deps;

	return {
		"models.catalog": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as {
				provider?: string;
				limit?: number;
				offset?: number;
			} | undefined;

			// Load provider specs and dynamic models
			const specs = await listProviderSpecs({ includeDynamic: true, disableFetch: false });
			const catalogData = await loadCatalogData();

			// Filter by provider if specified
			let filteredSpecs = specs;
			if (p?.provider) {
				filteredSpecs = specs.filter((s) => s.name === p.provider);
			}

			const providers = filteredSpecs.map((spec) => {
				const models = mergeProviderModels(spec, catalogData);
				return {
					name: spec.name,
					displayName: spec.display_name,
					envKey: spec.env_key,
					models,
				};
			});

			// Apply pagination
			const offset = p?.offset ?? 0;
			const limit = Math.min(p?.limit ?? 100, 500);

			// Calculate totals
			const totalModels = providers.reduce((sum, p) => sum + p.models.length, 0);

			// Slice models per provider for pagination
			const paginatedProviders = providers.map((provider) => ({
				...provider,
				models: provider.models.slice(offset, offset + limit),
			}));

			return {
				providers: paginatedProviders,
				totalModels,
				totalProviders: providers.length,
			} as ModelsCatalogResult;
		},

		"models.selected": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const model = getSelectedModel();
			if (!model) {
				return {
					model: null,
					modelId: "",
					providerId: "",
				} as ModelsSelectedResult;
			}

			// Parse model ref (e.g., "openai/gpt-4" -> provider: "openai", model: "gpt-4")
			const slashIdx = model.indexOf("/");
			const providerId = slashIdx > 0 ? model.slice(0, slashIdx) : "openai";
			const modelId = slashIdx > 0 ? model.slice(slashIdx + 1) : model;

			return {
				model,
				modelId,
				providerId,
			} as ModelsSelectedResult;
		},

		"models.select": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { model?: string } | undefined;
			const model = p?.model;

			if (!model) {
				throw new Error("model is required");
			}

			// Validate the model exists in available models
			const specs = await listProviderSpecs({ includeDynamic: true, disableFetch: false });
			const catalogData = await loadCatalogData();

			let found = false;
			for (const spec of specs) {
				const providerModels = mergeProviderModels(spec, catalogData);
				if (providerModels.some((m) => m.id === model || m.id.startsWith(`${spec.name}/`))) {
					found = true;
					break;
				}
				// Also check if model starts with provider name
				if (model.startsWith(`${spec.name}/`)) {
					found = true;
					break;
				}
			}

			// Allow any model if we can't validate (e.g., network failure)
			if (!found && catalogData && Object.keys(catalogData).length > 0) {
				throw new Error(`model "${model}" not found in catalog`);
			}

			setSelectedModel(model);

			const slashIdx = model.indexOf("/");
			const providerId = slashIdx > 0 ? model.slice(0, slashIdx) : "openai";
			const modelId = slashIdx > 0 ? model.slice(slashIdx + 1) : model;

			return {
				ok: true,
				model,
				modelId,
				providerId,
			} as ModelsSelectResult;
		},
	};
}