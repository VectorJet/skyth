import type {
	ToolDefinition,
	ToolExecutionResult,
	ToolRegistryOptions,
	RegisteredTool,
} from "@/gateway/registries/tools/types.ts";
import chalk from "chalk";

export class ToolRegistry {
	private tools: Map<string, RegisteredTool> = new Map();
	private options: ToolRegistryOptions;

	constructor(options: ToolRegistryOptions = {}) {
		this.options = {
			validateSchemas: true,
			allowOverride: false,
			...options,
		};
	}

	/**
	 * Register a custom tool
	 */
	register(
		definition: ToolDefinition,
		source: "custom" | "mcp" | "builtin" | "pipeline" = "custom",
	): void {
		const { name } = definition;

		// Check if tool already exists
		if (this.tools.has(name) && !this.options.allowOverride) {
			throw new Error(
				`Tool "${name}" is already registered. Set allowOverride to true to replace it.`,
			);
		}

		// Validate tool definition
		if (this.options.validateSchemas) {
			this.validateToolDefinition(definition);
		}

		// Register the tool
		this.tools.set(name, {
			definition,
			registeredAt: new Date(),
			source,
		});

		console.log(chalk.green(`✓ Registered tool: ${name} (${source})`));
	}

	/**
	 * Register multiple tools at once
	 */
	registerBatch(
		definitions: ToolDefinition[],
		source: "custom" | "mcp" | "builtin" | "pipeline" = "custom",
	): void {
		for (const definition of definitions) {
			try {
				this.register(definition, source);
			} catch (error) {
				console.error(
					chalk.red(`✗ Failed to register tool "${definition.name}":`, error),
				);
			}
		}
	}

	/**
	 * Unregister a tool
	 */
	unregister(name: string): boolean {
		const deleted = this.tools.delete(name);
		if (deleted) {
			console.log(chalk.yellow(`✓ Unregistered tool: ${name}`));
		}
		return deleted;
	}

	/**
	 * Get a tool by name
	 */
	getTool(name: string): RegisteredTool | undefined {
		return this.tools.get(name);
	}

	/**
	 * Get all registered tools
	 */
	getAllTools(): Map<string, RegisteredTool> {
		return new Map(this.tools);
	}

	/**
	 * List all tool names
	 */
	listToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	/**
	 * Execute a tool by name
	 */
	async executeTool(
		name: string,
		args: Record<string, any> = {},
	): Promise<ToolExecutionResult> {
		const startTime = Date.now();

		const tool = this.tools.get(name);
		if (!tool) {
			return {
				success: false,
				error: `Tool "${name}" not found`,
				executionTime: Date.now() - startTime,
			};
		}

		try {
			// Validate arguments if schema validation is enabled
			if (this.options.validateSchemas) {
				this.validateArguments(tool.definition, args);
			}

			// Execute the tool handler
			const result = await tool.definition.handler(args);

			return {
				success: true,
				result,
				executionTime: Date.now() - startTime,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				executionTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * Check if a tool exists
	 */
	hasTool(name: string): boolean {
		return this.tools.has(name);
	}

	/**
	 * Get tools by category
	 */
	getToolsByCategory(category: string): RegisteredTool[] {
		return Array.from(this.tools.values()).filter(
			(tool) => tool.definition.metadata?.category === category,
		);
	}

	/**
	 * Get tools by source
	 */
	getToolsBySource(source: "custom" | "mcp" | "builtin"): RegisteredTool[] {
		return Array.from(this.tools.values()).filter(
			(tool) => tool.source === source,
		);
	}

	/**
	 * Clear all tools
	 */
	clear(): void {
		this.tools.clear();
		console.log(chalk.yellow("✓ Cleared all tools from registry"));
	}

	/**
	 * Get registry statistics
	 */
	getStats() {
		const tools = Array.from(this.tools.values());
		return {
			total: tools.length,
			custom: tools.filter((t) => t.source === "custom").length,
			mcp: tools.filter((t) => t.source === "mcp").length,
			builtin: tools.filter((t) => t.source === "builtin").length,
			pipeline: tools.filter((t) => t.source === "pipeline").length,
			categories: [
				...new Set(
					tools.map((t) => t.definition.metadata?.category).filter(Boolean),
				),
			],
		};
	}

	/**
	 * Validate tool definition
	 */
	private validateToolDefinition(definition: ToolDefinition): void {
		if (!definition.name || typeof definition.name !== "string") {
			throw new Error("Tool name is required and must be a string");
		}

		if (!definition.description || typeof definition.description !== "string") {
			throw new Error("Tool description is required and must be a string");
		}

		if (!Array.isArray(definition.parameters)) {
			throw new Error("Tool parameters must be an array");
		}

		if (typeof definition.handler !== "function") {
			throw new Error("Tool handler must be a function");
		}

		// Validate parameters
		for (const param of definition.parameters) {
			if (!param.name || typeof param.name !== "string") {
				throw new Error(`Parameter name is required and must be a string`);
			}

			if (!param.type) {
				throw new Error(`Parameter "${param.name}" must have a type`);
			}

			const validTypes = ["string", "number", "boolean", "object", "array"];
			if (!validTypes.includes(param.type)) {
				throw new Error(
					`Parameter "${param.name}" has invalid type: ${param.type}`,
				);
			}
		}
	}

	/**
	 * Validate arguments against tool parameters
	 */
	private validateArguments(
		definition: ToolDefinition,
		args: Record<string, any>,
	): void {
		for (const param of definition.parameters) {
			const value = args[param.name];

			// Check required parameters
			if (param.required && value === undefined) {
				throw new Error(`Required parameter "${param.name}" is missing`);
			}

			// Skip validation if value is undefined and not required
			if (value === undefined) {
				continue;
			}

			// Type validation
			const actualType = Array.isArray(value) ? "array" : typeof value;
			if (param.type === "object" && actualType !== "object") {
				throw new Error(`Parameter "${param.name}" must be an object`);
			} else if (param.type === "array" && !Array.isArray(value)) {
				throw new Error(`Parameter "${param.name}" must be an array`);
			} else if (
				param.type !== "object" &&
				param.type !== "array" &&
				actualType !== param.type
			) {
				throw new Error(
					`Parameter "${param.name}" must be of type ${param.type}`,
				);
			}

			// Enum validation
			if (param.enum && !param.enum.includes(value)) {
				throw new Error(
					`Parameter "${param.name}" must be one of: ${param.enum.join(", ")}`,
				);
			}
		}
	}
}
