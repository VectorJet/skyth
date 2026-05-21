import { homedir } from "os";
import * as path from "path";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";

export interface GatewaySourceLayout {
	builtin: LoadSource[];
	workspace: LoadSource[];
	temporary: LoadSource[];
	all: LoadSource[];
	workspaceRoot: string;
}

export function defaultWorkspaceRoot(): string {
	return (
		process.env.CLAUDE_GATEWAY_WORKSPACE ||
		path.join(homedir(), ".claude-gateway", "workspaces", "default")
	);
}

export function createGatewaySourceLayout(
	workspaceRoot = defaultWorkspaceRoot(),
): GatewaySourceLayout {
	const builtin: LoadSource[] = [
		{
			kind: "builtin",
			label: "builtin-tools",
			root: "src/builtin/tools",
			writable: false,
			trustLevel: "trusted",
			capabilities: ["tool"],
		},
		{
			kind: "builtin",
			label: "builtin-pipelines",
			root: "src/builtin/pipelines",
			writable: false,
			trustLevel: "trusted",
			capabilities: ["pipeline"],
		},
		{
			kind: "builtin",
			label: "builtin-skills",
			root: "src/builtin/skills",
			writable: false,
			trustLevel: "trusted",
			capabilities: ["skill"],
		},
		{
			kind: "builtin",
			label: "builtin-mcp",
			root: "src/builtin/mcp",
			writable: false,
			trustLevel: "trusted",
			capabilities: ["mcp"],
		},
		{
			kind: "builtin",
			label: "builtin-agents",
			root: "src/builtin/agents",
			writable: false,
			trustLevel: "trusted",
			capabilities: ["agent"],
		},
	];

	const workspace: LoadSource[] = [
		{
			kind: "workspace",
			label: "workspace-tools",
			root: path.join(workspaceRoot, "TOOLS"),
			writable: true,
			trustLevel: "local",
			capabilities: ["tool"],
		},
		{
			kind: "workspace",
			label: "workspace-pipelines",
			root: path.join(workspaceRoot, "PIPELINES"),
			writable: true,
			trustLevel: "local",
			capabilities: ["pipeline"],
		},
		{
			kind: "workspace",
			label: "workspace-skills",
			root: path.join(workspaceRoot, "SKILLS"),
			writable: true,
			trustLevel: "local",
			capabilities: ["skill"],
		},
		{
			kind: "workspace",
			label: "workspace-mcp",
			root: path.join(workspaceRoot, "MCP"),
			writable: true,
			trustLevel: "local",
			capabilities: ["mcp"],
		},
		{
			kind: "workspace",
			label: "workspace-agents",
			root: path.join(workspaceRoot, "AGENTS"),
			writable: true,
			trustLevel: "local",
			capabilities: ["agent"],
		},
	];

	const temporary: LoadSource[] = [
		{
			kind: "temporary",
			label: "temporary-tools",
			root: path.join(workspaceRoot, "TEMP", "tools"),
			writable: true,
			trustLevel: "generated",
			capabilities: ["tool"],
		},
		{
			kind: "temporary",
			label: "temporary-pipelines",
			root: path.join(workspaceRoot, "TEMP", "pipelines"),
			writable: true,
			trustLevel: "generated",
			capabilities: ["pipeline"],
		},
		{
			kind: "temporary",
			label: "temporary-skills",
			root: path.join(workspaceRoot, "TEMP", "skills"),
			writable: true,
			trustLevel: "generated",
			capabilities: ["skill"],
		},
		{
			kind: "temporary",
			label: "temporary-mcp",
			root: path.join(workspaceRoot, "TEMP", "mcp"),
			writable: true,
			trustLevel: "generated",
			capabilities: ["mcp"],
		},
		{
			kind: "temporary",
			label: "temporary-agents",
			root: path.join(workspaceRoot, "TEMP", "agents"),
			writable: true,
			trustLevel: "generated",
			capabilities: ["agent"],
		},
	];

	return {
		builtin,
		workspace,
		temporary,
		all: [...builtin, ...workspace, ...temporary],
		workspaceRoot,
	};
}
