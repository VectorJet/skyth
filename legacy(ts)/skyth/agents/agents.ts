import type { PermissionNext } from "@/permission/next";

export namespace Agent {
	export interface Info {
		name: string;
		mode: "primary" | "subagent";
		description?: string;
		permission: PermissionNext extends {
			evaluate(tool: string, pattern: string, permission: infer P): any;
		}
			? P
			: never;
		model?: {
			modelID: string;
			providerID: string;
		};
	}

	const AGENTS: Info[] = [
		{
			name: "generalist",
			mode: "primary",
			description:
				"The main Skyth agent that handles user requests across all channels.",
			permission: [],
		},
		{
			name: "explore",
			mode: "subagent",
			description:
				"Explores codebases to find files, understand architecture, and answer questions.",
			permission: [
				{ permission: "task", pattern: "*", action: "allow" },
			] as Info["permission"],
		},
		{
			name: "code",
			mode: "subagent",
			description: "Specialized agent for code generation and editing tasks.",
			permission: [],
		},
	];

	export async function list(): Promise<Info[]> {
		return AGENTS;
	}

	export async function get(id: string): Promise<Info | undefined> {
		return AGENTS.find((a) => a.name === id);
	}
}
