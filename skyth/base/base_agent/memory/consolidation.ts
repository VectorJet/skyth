import type { Session } from "@/session/manager";

export interface ConsolidationState {
	memoryWindow: number;
	consolidating: Set<string>;
	tasks: Set<Promise<void>>;
	locks: Map<string, Promise<void>>;
}

export function waitForConsolidationLock(
	state: ConsolidationState,
	key: string,
): Promise<void> {
	return state.locks.get(key) ?? Promise.resolve();
}

export function setConsolidationLock(
	state: ConsolidationState,
	key: string,
	promise: Promise<void>,
): void {
	state.locks.set(key, promise);
}

export function clearConsolidationLock(
	state: ConsolidationState,
	key: string,
	promise: Promise<void>,
): void {
	if (state.locks.get(key) === promise) state.locks.delete(key);
}

export function scheduleConsolidation(params: {
	state: ConsolidationState;
	session: Session;
	consolidate: (session: Session, archiveAll?: boolean) => Promise<boolean>;
}): void {
	const { state, session } = params;
	const unconsolidated = session.messages.length - session.lastConsolidated;
	if (
		unconsolidated < state.memoryWindow ||
		state.consolidating.has(session.key)
	)
		return;

	state.consolidating.add(session.key);

	const promise = (async () => {
		try {
			await params.consolidate(session, false);
		} finally {
			state.consolidating.delete(session.key);
		}
	})();

	setConsolidationLock(state, session.key, promise);
	state.tasks.add(promise);
	promise.finally(() => {
		state.tasks.delete(promise);
		clearConsolidationLock(state, session.key, promise);
	});
}
