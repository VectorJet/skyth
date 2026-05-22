import type { MetaToolModules } from "@/gateway/meta/tools/manager/modules.ts";

export function startMetaReloadTimer(
	currentTimer: Timer | null,
	reload: () => Promise<boolean>,
	setTimer: (timer: Timer | null) => void,
	notify?: () => void,
): void {
	if (currentTimer) return;
	const intervalMs = Math.max(
		250,
		Number(process.env.CLAUDE_GATEWAY_META_RELOAD_MS ?? 1000),
	);
	console.log(
		`[MetaTools] Meta-tool hot reload enabled for gateway meta tools every ${intervalMs}ms`,
	);
	setTimer(
		setInterval(() => {
			void reload().then((changed) => {
				if (changed) notify?.();
			});
		}, intervalMs),
	);
}

export type MetaReloadState = {
	fingerprint: string;
	modules: MetaToolModules | null;
};
