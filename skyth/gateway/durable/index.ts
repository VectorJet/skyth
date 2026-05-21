import { QueueStore } from "@/gateway/workspace/queue-store.ts";
import type {
	DurableCronStore,
	DurableHeartbeatStore,
	DurableMemoryAuthority,
	DurableQueueStore,
	DurableStateTransitionStore,
} from "@/gateway/durable/interfaces.ts";
import {
	GatewayMemoryCompatibilityAdapter,
	QuasarCronAdapter,
	QuasarHeartbeatAdapter,
	QuasarMemoryMirrorAdapter,
	QuasarQueueAdapter,
	QuasarStateTransitionAdapter,
} from "@/gateway/durable/quasar-adapters.ts";

class NoopHeartbeatStore implements DurableHeartbeatStore {
	async append(): Promise<void> {}
}

class NoopCronStore implements DurableCronStore {
	async register(): Promise<void> {}
}

class NoopStateTransitionStore implements DurableStateTransitionStore {
	async record(): Promise<void> {}
}

export interface DurableStores {
	queue: DurableQueueStore;
	memory: DurableMemoryAuthority;
	heartbeat: DurableHeartbeatStore;
	cron: DurableCronStore;
	stateTransitions: DurableStateTransitionStore;
}

export function createDurableStores(): DurableStores {
	const useQuasar = process.env.SKYTH_QUASAR_ADAPTERS !== "0";
	const useQuasarQueue = useQuasar && process.env.SKYTH_QUASAR_QUEUE === "1";
	return {
		queue: useQuasarQueue ? new QuasarQueueAdapter() : new QueueStore(),
		memory: useQuasar
			? new QuasarMemoryMirrorAdapter()
			: new GatewayMemoryCompatibilityAdapter(),
		heartbeat: useQuasar
			? new QuasarHeartbeatAdapter()
			: new NoopHeartbeatStore(),
		cron: useQuasar ? new QuasarCronAdapter() : new NoopCronStore(),
		stateTransitions: useQuasar
			? new QuasarStateTransitionAdapter()
			: new NoopStateTransitionStore(),
	};
}

export type {
	DurableCronStore,
	DurableHeartbeatStore,
	DurableMemoryAuthority,
	DurableQueueStore,
	DurableStateTransitionStore,
} from "@/gateway/durable/interfaces.ts";
