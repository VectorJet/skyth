export const REDACTED_BLOCK = "[redacted]";

export const PROVIDER_SECRET_PATHS = ["api_key"] as const;
export const TOOL_SECRET_PATHS = ["web.search.api_key"] as const;
export const CHANNEL_SECRET_PATHS: Record<string, string[]> = {
	whatsapp: ["bridge_token"],
	telegram: ["token"],
	discord: ["token"],
	feishu: ["app_secret", "encrypt_key", "verification_token"],
	mochat: ["claw_token"],
	dingtalk: ["client_secret"],
	slack: ["bot_token", "app_token"],
	qq: ["secret"],
	email: ["imap_password", "smtp_password"],
};

export function cloneObject<T>(value: T): T {
	return JSON.parse(JSON.stringify(value ?? {})) as T;
}

export function isRedactedBlock(value: unknown): boolean {
	return (
		typeof value === "string" &&
		value.trim().toLowerCase().startsWith(REDACTED_BLOCK)
	);
}

export function deepGet(obj: Record<string, any>, path: string): unknown {
	let current: unknown = obj;
	for (const part of path.split(".")) {
		if (!current || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export function deepSet(
	obj: Record<string, any>,
	path: string,
	value: unknown,
): void {
	const parts = path.split(".");
	let current = obj;
	for (const part of parts.slice(0, -1)) {
		if (!current[part] || typeof current[part] !== "object") {
			current[part] = {};
		}
		current = current[part];
	}
	current[parts[parts.length - 1]!] = value;
}
