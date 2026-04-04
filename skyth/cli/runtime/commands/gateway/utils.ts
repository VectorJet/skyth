import { type EventKind, eventLine } from "@/logging/events";
import type { MemoryStore } from "@/base/base_agent/memory/store";

export function localDate(tsMs = Date.now()): string {
	const d = new Date(tsMs);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export type EmitFn = (
	kind: EventKind,
	scope: string,
	action: string,
	summary?: string,
	details?: Record<string, unknown>,
	sessionKey?: string,
	asError?: boolean,
	skipClamp?: boolean,
) => void;

export function createEmitFn(memory: MemoryStore): EmitFn {
	return (
		kind: EventKind,
		scope: string,
		action: string,
		summary = "",
		details?: Record<string, unknown>,
		sessionKey?: string,
		asError = false,
		skipClamp = false,
	): void => {
		const line = eventLine(kind, scope, action, summary, skipClamp);
		if (asError) console.error(line);
		else console.log(line);
		memory.recordEvent({
			kind,
			scope,
			action,
			summary,
			details,
			session_key: sessionKey,
		});
	};
}
