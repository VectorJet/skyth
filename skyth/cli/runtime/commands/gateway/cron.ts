import type { AgentLoop } from "@/base/base_agent/runtime";
import type { CronService } from "@/cron/service";
import type { MessageBus } from "@/bus/queue";
import type { DeliveryTarget } from "@/cli/gateway_delivery";
import { resolveDeliveryTarget } from "@/cli/gateway_delivery";
import type { MemoryStore } from "@/base/base_agent/memory/store";
import type { EmitFn } from "./utils";
import { localDate } from "./utils";

export interface CronHandlerDeps {
	cron: CronService;
	agent: AgentLoop;
	bus: MessageBus;
	memory: MemoryStore;
	emit: EmitFn;
}

export interface CronHandlerParams {
	lastActiveTargetRef: { current: DeliveryTarget | undefined };
}

export function setupCronHandler(
	{ cron, agent, bus, memory, emit }: CronHandlerDeps,
	{ lastActiveTargetRef }: CronHandlerParams,
) {
	cron.onJob = async (job) => {
		emit("cron", "gateway", "run", String(job.name ?? job.id), {
			jobId: job.id,
		});
		if (job.payload.kind === "daily_summary") {
			const requestedDate = String(job.payload.message ?? "").trim();
			const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
				? requestedDate
				: localDate();
			const summary = memory.writeDailySummary(date);
			emit("cron", "memory", "daily", summary.date, {
				path: summary.path,
				events: summary.eventCount,
			});
			emit("cron", "gateway", "done", String(job.id));
			return `daily summary: ${summary.path}`;
		}
		const target = resolveDeliveryTarget({
			channel: job.payload.channel,
			chatId: job.payload.to,
			fallback: lastActiveTargetRef.current,
		});
		const deliverChannel = target?.channel ?? "cli";
		const deliverTo = target?.chatId ?? "cron";
		const response = await agent.processMessage(
			{
				channel: deliverChannel,
				senderId: "cron",
				chatId: deliverTo,
				content: job.payload.message,
				metadata: { source: "cron", cron_job_id: job.id },
			},
			`cron:${job.id}`,
		);
		const autoDeliverSystemEvent = job.payload.kind === "system_event";
		const shouldDeliver =
			Boolean(job.payload.deliver) || autoDeliverSystemEvent;
		if (shouldDeliver && response && target) {
			await bus.publishOutbound({
				...response,
				channel: target.channel,
				chatId: target.chatId,
			});
			emit("cron", "gateway", "send", "delivered");
		} else if (shouldDeliver && !target) {
			emit("cron", "gateway", "drop", "no target");
		}
		emit("cron", "gateway", "done", String(job.id));
		return response?.content;
	};
}