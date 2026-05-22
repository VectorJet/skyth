import type { ToolDefinition } from "@/base/base_agent/sdk/types";
import type {
	ToolDefinition as GatewayToolDefinition,
	ToolParameter,
} from "@/gateway/registries/tools";

export function toGatewayToolDefinition(
	tool: ToolDefinition,
): GatewayToolDefinition {
	return {
		name: tool.name,
		description: tool.description,
		parameters: jsonSchemaToGatewayParameters(tool.parameters),
		handler: async (args) => {
			const { _context, ...params } = args;
			if (
				"validateParams" in tool &&
				typeof tool.validateParams === "function"
			) {
				const errors = tool.validateParams(params);
				if (errors && errors.length) {
					throw new Error(errors.join("; "));
				}
			}
			return await tool.execute(params, _context);
		},
		metadata: {
			category: "agent",
			version: tool.version,
			author: tool.author,
		},
	};
}

export function gatewayParametersToJsonSchema(
	parameters: ToolParameter[] = [],
): Record<string, any> {
	const properties: Record<string, any> = {};
	const required: string[] = [];
	for (const parameter of parameters) {
		properties[parameter.name] = {
			type: parameter.type,
			description: parameter.description,
			default: parameter.default,
			enum: parameter.enum,
			...(parameter.properties
				? {
						properties: Object.fromEntries(
							Object.entries(parameter.properties).map(([name, prop]) => [
								name,
								gatewayParameterToJsonSchemaProperty(prop),
							]),
						),
					}
				: {}),
			...(parameter.items
				? { items: gatewayParameterToJsonSchemaProperty(parameter.items) }
				: {}),
		};
		if (parameter.required) required.push(parameter.name);
	}
	return {
		type: "object",
		properties,
		...(required.length ? { required } : {}),
	};
}

function gatewayParameterToJsonSchemaProperty(
	parameter: ToolParameter,
): Record<string, any> {
	const required = Array.isArray((parameter as any).required)
		? ((parameter as any).required as string[])
		: undefined;
	return {
		type: parameter.type,
		description: parameter.description,
		default: parameter.default,
		enum: parameter.enum,
		...(parameter.properties
			? {
					properties: Object.fromEntries(
						Object.entries(parameter.properties).map(([name, prop]) => [
							name,
							gatewayParameterToJsonSchemaProperty(prop),
						]),
					),
				}
			: {}),
		...(parameter.items
			? { items: gatewayParameterToJsonSchemaProperty(parameter.items) }
			: {}),
		...(required ? { required } : {}),
	};
}

function jsonSchemaToGatewayParameters(schema: unknown): ToolParameter[] {
	if (!schema || typeof schema !== "object") return [];
	const objectSchema = schema as Record<string, any>;
	const properties = objectSchema.properties;
	if (!properties || typeof properties !== "object") return [];
	const required = new Set<string>(
		Array.isArray(objectSchema.required) ? objectSchema.required : [],
	);

	return Object.entries(properties).map(([name, property]) => {
		const prop = property as Record<string, any>;
		return {
			name,
			description: typeof prop.description === "string" ? prop.description : "",
			type: normalizeGatewayParameterType(prop.type),
			required: required.has(name),
			default: prop.default,
			enum: Array.isArray(prop.enum) ? prop.enum : undefined,
			properties:
				prop.properties && typeof prop.properties === "object"
					? Object.fromEntries(
							Object.entries(prop.properties).map(([childName, child]) => [
								childName,
								jsonSchemaPropertyToGatewayParameter(childName, child),
							]),
						)
					: undefined,
			items: prop.items
				? jsonSchemaPropertyToGatewayParameter("item", prop.items)
				: undefined,
		};
	});
}

function jsonSchemaPropertyToGatewayParameter(
	name: string,
	property: unknown,
): ToolParameter {
	const prop = (
		property && typeof property === "object" ? property : {}
	) as Record<string, any>;
	return {
		name,
		description: typeof prop.description === "string" ? prop.description : "",
		type: normalizeGatewayParameterType(prop.type),
		required: false,
		default: prop.default,
		enum: Array.isArray(prop.enum) ? prop.enum : undefined,
	};
}

function normalizeGatewayParameterType(input: unknown): ToolParameter["type"] {
	if (
		input === "number" ||
		input === "boolean" ||
		input === "object" ||
		input === "array"
	)
		return input;
	return "string";
}
