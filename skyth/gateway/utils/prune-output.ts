const DROP_KEYS_WHEN_FALSE = new Set(["isError"]);
const DROP_KEYS_WHEN_TRUE = new Set(["success", "successful"]);
const DROP_KEYS_WHEN_EMPTY = new Set(["error", "errors"]);

export function pruneGatewayOutput(value: any): any {
	if (value == null) return undefined;
	if (typeof value === "string") return value.trim() === "" ? undefined : value;
	if (typeof value !== "object") return value;

	if (Array.isArray(value)) {
		const items = value
			.map((item) => pruneGatewayOutput(item))
			.filter((item) => item !== undefined);
		return items.length > 0 ? items : undefined;
	}

	const out: Record<string, any> = {};
	for (const [key, raw] of Object.entries(value)) {
		if (DROP_KEYS_WHEN_FALSE.has(key) && raw === false) continue;
		if (DROP_KEYS_WHEN_TRUE.has(key) && raw === true) continue;
		if (
			DROP_KEYS_WHEN_EMPTY.has(key) &&
			(raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0))
		)
			continue;

		let valueToPrune = raw;
		if (key === "text" && typeof raw === "string") {
			const trimmed = raw.trim();
			if (
				(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
				(trimmed.startsWith("[") && trimmed.endsWith("]"))
			) {
				try {
					valueToPrune = JSON.stringify(
						pruneGatewayOutputObject(JSON.parse(trimmed)),
						null,
						2,
					);
				} catch {
					valueToPrune = raw;
				}
			}
		}

		const pruned = pruneGatewayOutput(valueToPrune);
		if (pruned === undefined) continue;
		out[key] = pruned;
	}

	return Object.keys(out).length > 0 ? out : undefined;
}

export function pruneGatewayOutputObject<T>(value: T): T {
	return (pruneGatewayOutput(value) ?? {}) as T;
}
