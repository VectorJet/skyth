import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ASCII_PATH = join(MODULE_DIR, "..", "ascii.txt");

export function defaultWrite(line: string): void {
	console.log(line);
}

export function readAsciiArt(): string {
	try {
		return readFileSync(ASCII_PATH, "utf-8").trimEnd();
	} catch {
		return "";
	}
}

export function printHeader(write: (line: string) => void): void {
	write("Skyth onboarding");
	write("A guided setup for local gateway and workspace defaults.");
	write("");
	const art = readAsciiArt();
	if (art) {
		write(art);
		write("");
	}
}

export function printSection(
	title: string,
	lines: string[],
	write: (line: string) => void,
): void {
	const width = 74;
	const divider = "-".repeat(width);
	write(`+${divider}+`);
	write(`| ${title}`);
	write(`|`);
	for (const line of lines) {
		write(`| ${line}`);
	}
	write(`+${divider}+`);
	write("");
}

export function printChoice(
	prompt: string,
	value: string,
	write: (line: string) => void,
): void {
	write(`* ${prompt}`);
	write(`  ${value}`);
	write("");
}
