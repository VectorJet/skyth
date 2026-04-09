import {
	clearConsolidationLock,
	setConsolidationLock,
	waitForConsolidationLock,
} from "@/base/base_agent/memory/consolidation";

export interface ConsolidationState {
	memoryWindow: number;
	consolidating: Set<string>;
	tasks: Set<Promise<void>>;
	locks: Map<string, Promise<void>>;
}

export function waitForConsolidation(
	state: ConsolidationState,
	key: string,
): Promise<void> {
	return waitForConsolidationLock(state, key);
}

export function setConsolidationLockHelper(
	state: ConsolidationState,
	key: string,
	promise: Promise<void>,
): void {
	setConsolidationLock(state, key, promise);
}

export function clearConsolidationLockHelper(
	state: ConsolidationState,
	key: string,
	promise: Promise<void>,
): void {
	clearConsolidationLock(state, key, promise);
}
