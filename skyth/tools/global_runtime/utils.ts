export function toText(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	return String(value);
}

export function shQuote(value: string): string {
	return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}