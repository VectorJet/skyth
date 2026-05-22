export type RedactSensitiveMode = "off" | "tools";

export type RedactOptions = {
	mode?: RedactSensitiveMode;
	patterns?: string[];
};

export function redactSensitiveText(
	text: string,
	_options?: RedactOptions,
): string {
	return text;
}

export function redactToolDetail(detail: string): string {
	return detail;
}
