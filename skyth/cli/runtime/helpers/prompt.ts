import { createInterface } from "node:readline";

export async function promptInput(prompt: string): Promise<string> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});
	const out = await new Promise<string>((resolve) =>
		rl.question(prompt, resolve),
	);
	rl.close();
	return out.trim();
}

export async function promptPassword(prompt: string): Promise<string> {
	process.stdout.write(prompt);
	const wasRaw = process.stdin.isRaw;
	process.stdin.setRawMode(true);
	process.stdin.resume();
	const chars: string[] = [];
	const result = await new Promise<string>((resolve) => {
		const onData = (data: Buffer): void => {
			const str = data.toString();
			for (const ch of str) {
				if (ch === "\r" || ch === "\n") {
					process.stdin.removeListener("data", onData);
					resolve(chars.join(""));
					return;
				}
				if (ch === "\x7f" || ch === "\b") {
					if (chars.length > 0) {
						chars.pop();
						process.stdout.write("\b \b");
					}
					continue;
				}
				if (ch === "\x03") {
					process.stdin.removeListener("data", onData);
					resolve("");
					return;
				}
				chars.push(ch);
				process.stdout.write("*");
			}
		};
		process.stdin.on("data", onData);
	});
	process.stdin.setRawMode(wasRaw);
	process.stdin.pause();
	process.stdout.write("\n");
	return result.trim();
}

export async function chooseProviderInteractive(
	providerIDs: string[],
): Promise<string | undefined> {
	if (!providerIDs.length) return undefined;
	console.log("Add credential");
	console.log("Select provider:");
	providerIDs.slice(0, 80).forEach((id, idx) => {
		console.log(`${String(idx + 1).padStart(2, " ")}. ${id}`);
	});
	const raw = await promptInput("Provider number or id: ");
	if (!raw) return undefined;
	const n = Number(raw);
	if (Number.isInteger(n) && n >= 1 && n <= providerIDs.length)
		return providerIDs[n - 1];
	if (providerIDs.includes(raw.replaceAll("-", "_")))
		return raw.replaceAll("-", "_");
	if (providerIDs.includes(raw)) return raw;
	return undefined;
}
