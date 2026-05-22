export const PROTOCOL_VERSION = "2025-11-25";
export const DEFAULT_HOST =
	process.env.SKYTH_GATEWAY_HOST ??
	process.env.CLAUDE_GATEWAY_HOST ??
	"skyth-gateway.local";

const DEFAULT_PORT = 52000;

function parsePortFromEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw.trim() === "") return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
		throw new Error(`${name} must be an integer port in the range 1..65535`);
	}
	return parsed;
}

// Default changed from 22000 to 52000 to avoid collisions with legacy gateway.
// Set SKYTH_GATEWAY_PORT=22000 to preserve the old behavior.
export const PORT = parsePortFromEnv("SKYTH_GATEWAY_PORT", DEFAULT_PORT);
