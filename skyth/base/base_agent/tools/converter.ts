import type { ToolDefinition } from "@/sdks/agent-sdk/types";

type LegacyToolInfoLike = {
	id: string;
	init: (ctx?: any) => Promise<{
		description: string;
		parameters: any;
		execute: (args: any, ctx: any) => Promise<any>;
	}>;
};

function isObjectLike(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object";
}

export function isToolDefinitionLike(value: unknown): value is ToolDefinition {
	return (
		isObjectLike(value) &&
		typeof value.name === "string" &&
		typeof value.description === "string" &&
		typeof value.execute === "function"
	);
}

export function isLegacyToolInfoLike(
	value: unknown,
): value is LegacyToolInfoLike {
	return (
		isObjectLike(value) &&
		typeof value.id === "string" &&
		typeof value.init === "function"
	);
}

function toLegacyContext(context?: Record<string, any>): Record<string, any> {
	return {
		sessionID: String(context?.sessionKey ?? "default"),
		messageID: String(context?.messageId ?? ""),
		agent: String(context?.agent ?? "base_agent"),
		abort:
			context?.abort instanceof AbortSignal
				? context.abort
				: new AbortController().signal,
		callID: context?.callID,
		extra: isObjectLike(context) ? context : {},
		messages: Array.isArray(context?.messages) ? context.messages : [],
		metadata(_input: { metadata?: Record<string, any> }) {
			// Legacy metadata callback is preserved for compatibility.
		},
		async ask(_input: Record<string, any>) {
			// Default compatibility bridge: legacy tools can request permission metadata,
			// but base runtime may not always provide an interactive permission callback.
			return;
		},
	};
}

export async function convertLegacyToolInfo(
	value: LegacyToolInfoLike,
): Promise<ToolDefinition> {
	const initialized = await value.init();
	const name = String(value.id ?? "").trim();
	const description =
		String(initialized?.description ?? "").trim() || `${name} tool`;
	const parameters = initialized?.parameters ?? {
		type: "object",
		properties: {},
	};
	const executeLegacy = initialized?.execute;

	return {
		name,
		description,
		parameters,
		async execute(
			params: Record<string, any>,
			context?: Record<string, any>,
		): Promise<string> {
			if (typeof executeLegacy !== "function") {
				return `Error: legacy tool '${name}' is missing execute()`;
			}
			try {
				const legacyCtx = toLegacyContext(context);
				const result = await executeLegacy(params ?? {}, legacyCtx);
				if (typeof result === "string") return result;
				if (isObjectLike(result) && typeof result.output === "string")
					return result.output;
				return JSON.stringify(result ?? "");
			} catch (error) {
				return `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	};
}
