export function encodeBase64(value: string | Uint8Array): string {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	return Buffer.from(bytes).toString("base64");
}

export function decodeBase64(value: string): Uint8Array {
	return new Uint8Array(Buffer.from(value, "base64"));
}
