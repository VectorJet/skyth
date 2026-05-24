/**
 * Pi-flavored re-export surface for the provider/model catalog.
 *
 * Onboarding, configure, status, and the gateway boot path import from this
 * module instead of `@/providers/registry` so that when the underlying
 * catalog source switches from `models.dev` (today) to Pi's
 * `getProviders()` / `getModels()` (later), only this file changes.
 *
 * No behavior is added here; this is a stable indirection seam.
 */

export {
	findByModel,
	findByName,
	findGateway,
	getModelLimits,
	listProviderSpecs,
	loadModelsDevCatalog,
	parseModelRef,
	preferredSmallModelCandidates,
	resolveModelSDKInfo,
	STATIC_PROVIDERS,
} from "@/providers/registry";

export type {
	ModelLimits,
	ModelSDKInfo,
	ModelsDevModel,
	ModelsDevProvider,
	ProviderSpec,
} from "@/providers/registry";
