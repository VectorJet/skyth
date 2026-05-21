import { homedir } from "os";
import { join } from "path";

export const SKYTH_HOME = process.env.SKYTH_HOME ?? join(homedir(), ".skyth");

export function envFirst(primary: string, legacy?: string): string | undefined {
	return process.env[primary] ?? (legacy ? process.env[legacy] : undefined);
}

export function envNumber(
	primary: string,
	legacy: string | undefined,
	fallback: number,
): number {
	const value = envFirst(primary, legacy);
	return value === undefined ? fallback : Number(value);
}

export function defaultGatewayWorkspaceRoot(): string {
	return (
		envFirst("SKYTH_GATEWAY_WORKSPACE", "CLAUDE_GATEWAY_WORKSPACE") ??
		join(SKYTH_HOME, "gateway", "workspaces")
	);
}

export function defaultGatewayWorkspace(id = "default"): string {
	const configured = envFirst("SKYTH_GATEWAY_WORKSPACE", "CLAUDE_GATEWAY_WORKSPACE");
	if (configured) return configured;
	return join(defaultGatewayWorkspaceRoot(), id);
}

export function setEnvCompatibility(primary: string, legacy: string, value: string) {
	if (!process.env[primary]) process.env[primary] = value;
	if (!process.env[legacy]) process.env[legacy] = value;
}
