import type { GatewayClient } from "@/gateway/protocol";
import type { MessageBus } from "@/bus/queue";
import type { ChannelManager } from "@/channels/manager";
import type { CronService } from "@/cron/service";
import type { SessionManager } from "@/session/manager";

export interface HealthHandlerDeps {
	bus: MessageBus;
	channelManager?: ChannelManager;
	cronService?: CronService;
	sessions?: SessionManager;
	clients: Set<GatewayClient>;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface HealthSummaryResult {
	status: string;
	uptime_ms: number;
	timestamp: number;
	clients: {
		total: number;
		authenticated: number;
	};
	queues: {
		inbound: number;
		outbound: number;
	};
	system: {
		memory_usage_mb?: number;
		cpu_usage_percent?: number;
	};
	channels?: Record<string, { enabled: boolean; running: boolean }>;
	cron?: {
		enabled: boolean;
		jobs: number;
		next_wake_at_ms?: number;
	};
	sessions?: {
		total: number;
	};
}

export interface HealthProbeResult {
	status: string;
	checks: Record<string, {
		status: string;
		message?: string;
		latency_ms?: number;
	}>;
	timestamp: number;
}

function getMemoryUsage(): number | undefined {
	if (process.memoryUsage) {
		return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
	}
	return undefined;
}

function getCpuUsage(): number | undefined {
	// Simple CPU usage estimation - in production would use os utils
	const cpu = process.cpuUsage?.();
	if (cpu) {
		return Math.round((cpu.user + cpu.system) / 1000000);
	}
	return undefined;
}

export function createHealthHandlers(deps: HealthHandlerDeps) {
	const { bus, channelManager, cronService, sessions, clients, getAuthenticatedNode } = deps;

	return {
		"health.summary": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			let authenticatedCount = 0;
			for (const c of clients) {
				if (c.authenticatedAt) {
					authenticatedCount++;
				}
			}

			const result: HealthSummaryResult = {
				status: "ok",
				uptime_ms: Math.round(process.uptime() * 1000),
				timestamp: Date.now(),
				clients: {
					total: clients.size,
					authenticated: authenticatedCount,
				},
				queues: {
					inbound: bus.inboundSize,
					outbound: bus.outboundSize,
				},
				system: {
					memory_usage_mb: getMemoryUsage(),
					cpu_usage_percent: getCpuUsage(),
				},
			};

			if (channelManager) {
				result.channels = channelManager.getStatus();
			}

			if (cronService) {
				const cronStatus = cronService.status();
				result.cron = {
					enabled: cronStatus.enabled,
					jobs: cronStatus.jobs,
					next_wake_at_ms: cronStatus.next_wake_at_ms,
				};
			}

			if (sessions) {
				result.sessions = {
					total: sessions.listSessions().length,
				};
			}

			return result;
		},

		"health.probe": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const checks: HealthProbeResult["checks"] = {};
			const start = Date.now();

			// Check message bus
			try {
				const busStart = Date.now();
				const inboundSize = bus.inboundSize;
				const outboundSize = bus.outboundSize;
				checks.messageBus = {
					status: "ok",
					message: `inbound: ${inboundSize}, outbound: ${outboundSize}`,
					latency_ms: Date.now() - busStart,
				};
			} catch (err) {
				checks.messageBus = {
					status: "error",
					message: err instanceof Error ? err.message : String(err),
				};
			}

			// Check channels
			if (channelManager) {
				try {
					const channelStart = Date.now();
					const status = channelManager.getStatus();
					const allRunning = Object.values(status).every((ch) => ch.running);
					checks.channels = {
						status: allRunning ? "ok" : "degraded",
						message: `${Object.keys(status).length} channels`,
						latency_ms: Date.now() - channelStart,
					};
				} catch (err) {
					checks.channels = {
						status: "error",
						message: err instanceof Error ? err.message : String(err),
					};
				}
			} else {
				checks.channels = {
					status: "skipped",
					message: "channel manager not available",
				};
			}

			// Check cron
			if (cronService) {
				try {
					const cronStart = Date.now();
					const status = cronService.status();
					checks.cron = {
						status: status.enabled ? "ok" : "degraded",
						message: `${status.jobs} jobs`,
						latency_ms: Date.now() - cronStart,
					};
				} catch (err) {
					checks.cron = {
						status: "error",
						message: err instanceof Error ? err.message : String(err),
					};
				}
			} else {
				checks.cron = {
					status: "skipped",
					message: "cron service not available",
				};
			}

			// Check sessions
			if (sessions) {
				try {
					const sessionStart = Date.now();
					const sessionList = sessions.listSessions();
					checks.sessions = {
						status: "ok",
						message: `${sessionList.length} sessions`,
						latency_ms: Date.now() - sessionStart,
					};
				} catch (err) {
					checks.sessions = {
						status: "error",
						message: err instanceof Error ? err.message : String(err),
					};
				}
			} else {
				checks.sessions = {
					status: "skipped",
					message: "session manager not available",
				};
			}

			// Overall status
			const hasErrors = Object.values(checks).some(
				(c) => c.status === "error",
			);
			const hasDegraded = Object.values(checks).some(
				(c) => c.status === "degraded",
			);

			return {
				status: hasErrors ? "error" : hasDegraded ? "degraded" : "ok",
				checks,
				timestamp: Date.now(),
			} as HealthProbeResult;
		},

		"presence.list": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const connectedClients: Array<{
				conn_id: string;
				authenticated: boolean;
				authenticated_at_ms?: number;
				channel?: string;
				sender_id?: string;
				device_id?: string;
				client_id?: string;
				ip?: string;
			}> = [];

			for (const client of clients) {
				connectedClients.push({
					conn_id: client.connId,
					authenticated: !!client.authenticatedAt,
					authenticated_at_ms: client.authenticatedAt ? Number(client.authenticatedAt) : undefined,
					channel: client.metadata?.channel as string | undefined,
					sender_id: client.metadata?.sender_id as string | undefined,
					device_id: (client as unknown as { connect?: { device?: { id?: string } } }).connect?.device?.id,
					client_id: (client as unknown as { connect?: { client?: { id?: string } } }).connect?.client?.id,
					ip: (client.socket as unknown as { remoteAddress?: string }).remoteAddress,
				});
			}

			return {
				clients: connectedClients,
				total: connectedClients.length,
				authenticated_count: connectedClients.filter((c) => c.authenticated).length,
			};
		},
	};
}