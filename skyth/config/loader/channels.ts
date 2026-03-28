import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	CHANNEL_SECRET_PATHS,
	REDACTED_BLOCK,
	cloneObject,
	deepGet,
	deepSet,
	isRedactedBlock,
	persistSecretValue,
} from "@/auth/secret_store";
import { hydrateSecretField } from "./secrets";
import { getChannelsDirPath } from "./paths";

const CHANNEL_NAMES = [
	"whatsapp",
	"telegram",
	"discord",
	"feishu",
	"mochat",
	"dingtalk",
	"slack",
	"qq",
	"email",
] as const;

function getChannelConfigPath(name: (typeof CHANNEL_NAMES)[number]): string {
	return join(getChannelsDirPath(), `${name}.json`);
}

export function loadChannelsConfig(
	fallbackChannels?: Record<string, any>,
): Record<string, any> {
	const out: Record<string, any> = { ...(fallbackChannels ?? {}) };
	let loadedAny = false;
	for (const name of CHANNEL_NAMES) {
		const path = getChannelConfigPath(name);
		if (!existsSync(path)) continue;
		try {
			const data = JSON.parse(readFileSync(path, "utf-8"));
			if (data && typeof data === "object" && !Array.isArray(data)) {
				const runtimePayload = cloneObject(data as Record<string, any>);
				const storagePayload = cloneObject(data as Record<string, any>);
				let migrated = false;
				const secretPaths = CHANNEL_SECRET_PATHS[name] ?? [];
				for (const secretPath of secretPaths) {
					migrated =
						hydrateSecretField({
							runtimeObject: runtimePayload,
							storageObject: storagePayload,
							path: secretPath,
							scope: "channels",
							subject: name,
						}) || migrated;
				}
				if (migrated) {
					writeFileSync(path, JSON.stringify(storagePayload, null, 2), "utf-8");
				}
				out[name] = runtimePayload;
				loadedAny = true;
			}
		} catch {
			// ignore malformed channel config and continue with fallback
		}
	}
	return loadedAny ? out : { ...(fallbackChannels ?? {}) };
}

export function saveChannelsConfig(
	channels: Record<string, any> | undefined,
	overwrite = false,
): void {
	const dir = getChannelsDirPath();
	mkdirSync(dir, { recursive: true });
	for (const name of CHANNEL_NAMES) {
		const path = getChannelConfigPath(name);
		if (!overwrite && existsSync(path)) continue;
		const payload =
			channels && typeof channels === "object" ? (channels[name] ?? {}) : {};
		const storagePayload = cloneObject(payload as Record<string, any>);
		for (const secretPath of CHANNEL_SECRET_PATHS[name] ?? []) {
			const value = deepGet(storagePayload, secretPath);
			if (typeof value !== "string") continue;
			const trimmed = value.trim();
			if (!trimmed || isRedactedBlock(trimmed)) continue;
			persistSecretValue({
				scope: "channels",
				subject: name,
				keyPath: secretPath,
				value: trimmed,
			});
			deepSet(storagePayload, secretPath, REDACTED_BLOCK);
		}
		writeFileSync(path, JSON.stringify(storagePayload, null, 2), "utf-8");
	}
}