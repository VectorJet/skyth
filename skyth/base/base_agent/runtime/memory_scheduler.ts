import type { Session } from "@/session/manager";
import type { RuntimeContext } from "@/base/base_agent/runtime/types";
import { scheduleConsolidation } from "@/base/base_agent/memory/consolidation";

export function scheduleConsolidationIfNeeded(
	runtime: RuntimeContext,
	session: Session,
): void {
	scheduleConsolidation({
		state: {
			memoryWindow: runtime.memoryWindow,
			consolidating: runtime._consolidating,
			tasks: runtime._consolidation_tasks,
			locks: runtime._consolidation_locks,
		},
		session,
		consolidate: (s, archiveAll) => runtime.consolidateMemory(s, archiveAll),
	});
}
