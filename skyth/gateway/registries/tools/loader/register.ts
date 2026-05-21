import chalk from "chalk";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";

interface LoadedTool {
	manifest: unknown;
	tool: ToolDefinition;
}

export async function loadAndRegisterTools(
	registry: ToolRegistry,
	source: "custom" | "builtin",
	scanTools: () => Promise<Map<string, string>>,
	loadTool: (toolPath: string) => Promise<LoadedTool | null>,
): Promise<void> {
	console.log(chalk.blue("\nLoading custom tools..."));
	const toolsMap = await scanTools();
	console.log(chalk.blue(`Found ${toolsMap.size} tool(s)`));
	for (const [toolName, toolPath] of toolsMap.entries()) {
		console.log(chalk.blue(`Loading tool: ${toolName}`));
		const loaded = await loadTool(toolPath);
		if (!loaded) continue;
		try {
			if (registry.hasTool(loaded.tool.name)) {
				console.log(
					chalk.yellow(
						`  ↷ Skipping already registered tool: ${loaded.tool.name}`,
					),
				);
				continue;
			}
			registry.register(loaded.tool, source);
		} catch (error: any) {
			console.error(
				chalk.red(`Failed to register tool ${toolName}: ${error.message}`),
			);
		}
	}
	console.log(
		chalk.green(`\n✓ Loaded ${registry.listToolNames().length} tool(s)\n`),
	);
}
