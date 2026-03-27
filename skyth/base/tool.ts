import type { ToolDefinition } from "@/sdks/agent-sdk/types";

export abstract class BaseTool implements ToolDefinition {
	private static TYPE_MAP: Record<string, string> = {
		string: "string",
		integer: "integer",
		number: "number",
		boolean: "boolean",
		array: "array",
		object: "object",
	};

	abstract get name(): string;
	abstract get description(): string;
	abstract get parameters(): Record<string, any>;
	abstract execute(params: Record<string, any>, ctx?: any): Promise<string>;

	validateParams(params: Record<string, any>): string[] {
		const schema = this.parameters ?? {};
		if ((schema.type ?? "object") !== "object") {
			throw new Error(`Schema must be object type, got ${String(schema.type)}`);
		}
		return this.validate(params, { ...schema, type: "object" }, "");
	}

	private validate(
		value: any,
		schema: Record<string, any>,
		path: string,
	): string[] {
		const t = schema.type;
		const label = path || "parameter";

		if (t && BaseTool.TYPE_MAP[t]) {
			if (
				t === "integer" &&
				(!Number.isInteger(value) || typeof value !== "number")
			)
				return [`${label} should be integer`];
			if (t === "number" && typeof value !== "number")
				return [`${label} should be number`];
			if (t === "string" && typeof value !== "string")
				return [`${label} should be string`];
			if (t === "boolean" && typeof value !== "boolean")
				return [`${label} should be boolean`];
			if (t === "array" && !Array.isArray(value))
				return [`${label} should be array`];
			if (
				t === "object" &&
				(!value || typeof value !== "object" || Array.isArray(value))
			)
				return [`${label} should be object`];
		}

		const errors: string[] = [];
		if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
			errors.push(`${label} must be one of ${JSON.stringify(schema.enum)}`);
		}
		if ((t === "integer" || t === "number") && typeof value === "number") {
			if (schema.minimum !== undefined && value < schema.minimum)
				errors.push(`${label} must be >= ${schema.minimum}`);
			if (schema.maximum !== undefined && value > schema.maximum)
				errors.push(`${label} must be <= ${schema.maximum}`);
		}
		if (t === "string" && typeof value === "string") {
			if (schema.minLength !== undefined && value.length < schema.minLength)
				errors.push(`${label} must be at least ${schema.minLength} chars`);
			if (schema.maxLength !== undefined && value.length > schema.maxLength)
				errors.push(`${label} must be at most ${schema.maxLength} chars`);
		}
		if (
			t === "object" &&
			value &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			const props = schema.properties ?? {};
			for (const required of schema.required ?? []) {
				if (!(required in value))
					errors.push(
						`missing required ${path ? `${path}.${required}` : required}`,
					);
			}
			for (const [k, v] of Object.entries(value)) {
				if (k in props)
					errors.push(...this.validate(v, props[k], path ? `${path}.${k}` : k));
			}
		}
		if (t === "array" && Array.isArray(value) && schema.items) {
			value.forEach((item: any, i: number) =>
				errors.push(
					...this.validate(
						item,
						schema.items,
						path ? `${path}[${i}]` : `[${i}]`,
					),
				),
			);
		}
		return errors;
	}

	toSchema(): Record<string, any> {
		return {
			type: "function",
			function: {
				name: this.name,
				description: this.description,
				parameters: this.parameters,
			},
		};
	}
}
