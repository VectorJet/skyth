import * as fs from "fs/promises";
import * as path from "path";
import { defaultWorkspaceRoot } from "@/gateway/sources/index.ts";
import type {
	CapabilityRunner,
	RunContext,
} from "@/gateway/core/contracts/index.ts";

export interface AgentRunResult {
	name: string;
	path: string;
	task?: string;
	instructions: string;
}

export class AgentRunner
	implements CapabilityRunner<Record<string, any>, AgentRunResult>
{
	readonly kind = "agent" as const;

	async run(
		name: string,
		args: Record<string, any> = {},
		context?: RunContext,
	): Promise<AgentRunResult> {
		const agentName = name.replace(/^agent:/, "");
		const root =
			context?.source?.root ||
			path.join(context?.workspaceRoot || defaultWorkspaceRoot(), "AGENTS");
		const filePath = path.join(root, `${agentName}.md`);
		const instructions = await fs.readFile(filePath, "utf8");
		return {
			name: agentName,
			path: filePath,
			task: typeof args.task === "string" ? args.task : undefined,
			instructions,
		};
	}
}
