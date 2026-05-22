import { QueueStore } from "@/gateway/workspace/queue-store.ts";
import type {
	DurableCronStore,
	DurableHeartbeatStore,
	DurableMemoryAuthority,
	DurableQueueStore,
	DurableRunEventStore,
	DurableStateTransitionStore,
} from "@/gateway/durable/interfaces.ts";
import {
	GatewayMemoryCompatibilityAdapter,
	QuasarCronAdapter,
	QuasarHeartbeatAdapter,
	QuasarMemoryMirrorAdapter,
	QuasarQueueAdapter,
	QuasarRunEventAdapter,
	QuasarStateTransitionAdapter,
	initializeQuasarDurability,
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

class NoopRunEventStore implements DurableRunEventStore {
	async record(): Promise<void> {}
}

export interface DurableStores {
	queue: DurableQueueStore;
	memory: DurableMemoryAuthority;
	heartbeat: DurableHeartbeatStore;
	cron: DurableCronStore;
	stateTransitions: DurableStateTransitionStore;
	runEvents: DurableRunEventStore;
}

export async function createDurableStores(): Promise<DurableStores> {
	const useQuasar = process.env.SKYTH_QUASAR_ADAPTERS !== "0";
	const quasarReady = useQuasar
		? await initializeQuasarDurability().catch((err) => {
				console.warn("[quasar] durability initialization failed:", err);
				return false;
			})
		: false;
	return {
		queue: quasarReady ? new QuasarQueueAdapter() : new QueueStore(),
		memory: quasarReady
			? new QuasarMemoryMirrorAdapter()
			: new GatewayMemoryCompatibilityAdapter(),
		heartbeat: quasarReady
			? new QuasarHeartbeatAdapter()
			: new NoopHeartbeatStore(),
		cron: quasarReady ? new QuasarCronAdapter() : new NoopCronStore(),
		stateTransitions: quasarReady
			? new QuasarStateTransitionAdapter()
			: new NoopStateTransitionStore(),
		runEvents: quasarReady
			? new QuasarRunEventAdapter()
			: new NoopRunEventStore(),
	};
}

export type {
	DurableCronStore,
	DurableHeartbeatStore,
	DurableMemoryAuthority,
	DurableQueueStore,
	DurableRunEventStore,
	DurableStateTransitionStore,
} from "@/gateway/durable/interfaces.ts";
