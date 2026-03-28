// Modularized re-exports from session/router subdirectory
// This file maintains backward compatibility while delegating to modular files

import { MergeRouter } from "./router/merge";
export { MergeRouter };

import { isExplicitCrossChannelRequest } from "./router/patterns";
export { isExplicitCrossChannelRequest };

export type {
	MergeDecision,
	MergeRouterResult,
	SessionNamingResult,
	MergeRouterOptions,
	CachedRouterResult,
	RouterDeps,
} from "./router/types";
