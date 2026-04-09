import {
	existsSync,
	readFileSync,
	readdirSync,
	createReadStream,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { Session } from "./session";

export function getSessionListItem(
	session: Session,
	sessionsDir: string,
): Record<string, any> {
	return {
		id: session.id,
		key: session.key,
		name: session.name ?? "",
		created_at: session.createdAt.toISOString(),
		updated_at: session.updatedAt.toISOString(),
		path: join(sessionsDir, `${session.key.replace(":", "_")}.jsonl`),
	};
}

export function listSessions(sessionsDir: string): Array<Record<string, any>> {
	if (!existsSync(sessionsDir)) return [];
	const out: Array<Record<string, any>> = [];
	for (const file of readdirSync(sessionsDir)) {
		if (!file.endsWith(".jsonl")) continue;
		const path = join(sessionsDir, file);
		const firstLine = readFileSync(path, "utf-8").split(/\r?\n/)[0];
		if (!firstLine) continue;
		try {
			const data = JSON.parse(firstLine);
			if (data._type === "metadata") {
				out.push({
					id: data.id,
					key: data.key ?? file.replace(".jsonl", "").replace("_", ":"),
					name: data.name ?? "",
					created_at: data.created_at,
					updated_at: data.updated_at,
					path,
				});
			}
		} catch {
			continue;
		}
	}
	return out.sort((a, b) =>
		String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
	);
}

export async function listSessionsAsync(
	sessionsDir: string,
): Promise<Array<Record<string, any>>> {
	if (!existsSync(sessionsDir)) return [];

	const files = await readdir(sessionsDir);
	const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

	const concurrencyLimit = 50;
	const results: (Record<string, any> | null)[] = [];

	for (let i = 0; i < jsonlFiles.length; i += concurrencyLimit) {
		const batch = jsonlFiles.slice(i, i + concurrencyLimit);
		const batchResults = await Promise.all(
			batch.map(async (file) => {
				const path = join(sessionsDir, file);
				try {
					const stream = createReadStream(path, { encoding: "utf-8" });
					const rl = createInterface({ input: stream, crlfDelay: Infinity });
					let firstLine: string | null = null;
					for await (const line of rl) {
						firstLine = line;
						break;
					}
					rl.close();
					stream.destroy();

					if (!firstLine) return null;

					const data = JSON.parse(firstLine);
					if (data._type === "metadata") {
						return {
							id: data.id,
							key: data.key ?? file.replace(".jsonl", "").replace("_", ":"),
							name: data.name ?? "",
							created_at: data.created_at,
							updated_at: data.updated_at,
							path,
						};
					}
				} catch {
					return null;
				}
				return null;
			}),
		);
		results.push(...batchResults);
	}

	const out = results.filter(Boolean) as Array<Record<string, any>>;
	return out.sort((a, b) =>
		String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
	);
}
