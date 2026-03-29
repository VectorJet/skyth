import { join } from "node:path";
import generalistFactory from "@/agents/generalist_agent/agent";
import {
	hasIdentityBinary,
	verifyDeviceIdentity,
} from "@/auth/device-fingerprint";
import {
	type DeliveryTarget,
	loadAllActiveChannelTargets,
	loadLastActiveChannelTarget,
} from "@/cli/gateway_delivery";
import { installGatewayLogger } from "@/cli/gateway_logger";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";
import {
	boolFlag,
	makeProviderFromConfig,
	strFlag,
} from "@/cli/runtime_helpers";
import { getDataDir, loadConfig } from "@/config/loader";
import { loadModelsDevCatalog } from "@/providers/registry";
import { discoverGateways, formatDiscoveryTable } from "@/gateway/discover";

import { createEmitFn, localDate } from "./utils";
import { createConsumer } from "./consumer";
import { setupCronHandler } from "./cron";
import { createGatewayHeartbeat } from "./heartbeat";
import {
	initializeGatewayServices,
	loadChannelTargets,
	setupAgentRefs,
} from "./startup";
import { emitTrustStatus } from "./trust";
import { loadWebHandler, startGatewayWsServer } from "./web";

function ensureDailySummaryJob(cron: CronService): void {
	const existing = cron
		.listJobs(true)
		.find(
			(job) =>
				job.name === "daily_summary_nightly" ||
				job.payload.kind === "daily_summary",
		);
	if (existing) return;
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	cron.addJob({
		name: "daily_summary_nightly",
		kind: "daily_summary",
		schedule: { kind: "cron", expr: "55 23 * * *", tz: timezone },
		message: "",
		deliver: false,
	});
}

export const gatewayHandler: CommandHandler = async ({
	positionals,
	flags,
}: CommandContext): Promise<number> => {
	const sub = positionals[1];
	if (sub === "discover") {
		const timeoutRaw =
			strFlag(flags, "timeout_ms") ?? strFlag(flags, "timeout");
		const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
		console.log("Discovering Skyth gateways on the local network...");
		const gateways = await discoverGateways({ timeoutMs });
		console.log(formatDiscoveryTable(gateways));
		return 0;
	}

	const cfg = loadConfig();
	await loadModelsDevCatalog();
	const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
	const routerModel =
		String(
			(cfg.session_graph as Record<string, unknown>)?.router_model ?? "",
		).trim() || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
	const port = Number(strFlag(flags, "port") ?? "18797");
	const verbose = boolFlag(flags, "verbose", false);
	const printLogs = boolFlag(flags, "print_logs", false);

	const { cron, memory, bus, channels } = await initializeGatewayServices(cfg);
	const cronStatus = cron.status();

	const provider = makeProviderFromConfig(model);

	const { lastActiveTarget, channelTargets } = loadChannelTargets(cfg);
	const channelTargetsRef = { current: channelTargets };

	const lifecycle = generalistFactory.create({
		bus,
		provider,
		workspace: cfg.workspace_path,
		model,
		temperature: cfg.agents.defaults.temperature,
		max_tokens: cfg.agents.defaults.max_tokens,
		max_iterations: cfg.agents.defaults.max_tool_iterations,
		steps: cfg.agents.defaults.steps,
		memory_window: cfg.agents.defaults.memory_window,
		exec_timeout: cfg.tools.exec.timeout,
		restrict_to_workspace: cfg.tools.restrict_to_workspace,
		cron_service: cron,
		router_model: routerModel || undefined,
		enabled_channels: channels.enabledChannels,
		session_graph_config: cfg.session_graph,
	});

	const agent = lifecycle.getRuntime();
	const emit = createEmitFn(memory);

	const runningRef = { current: true };
	const lastActiveTargetRef = { current: lastActiveTarget ?? undefined };

	setupAgentRefs(agent, lastActiveTargetRef, channelTargetsRef);

	setupCronHandler({ cron, agent, bus, memory, emit }, { lastActiveTargetRef });

	const consumer = createConsumer(
		{ agent, bus, channels, cfg, emit },
		{ runningRef, lastActiveTargetRef, channelTargetsRef },
	);

	const heartbeat = createGatewayHeartbeat(
		{ agent, bus, emit },
		{ workspace: cfg.workspace_path, lastActiveTargetRef },
	);

	const restoreConsole = installGatewayLogger({ printLogs, verbose });

	try {
		emit(
			"event",
			"gateway",
			"start",
			`port ${String(port)}`,
			undefined,
			undefined,
			false,
			true,
		);
		emit(
			"event",
			"gateway",
			"workspace",
			cfg.workspace_path,
			undefined,
			undefined,
			false,
			true,
		);
		emit("event", "gateway", "model", model, undefined, undefined, false, true);
		emit(
			"cron",
			"gateway",
			"jobs",
			String(cronStatus.jobs),
			undefined,
			undefined,
			false,
			true,
		);
		emit(
			"event",
			"gateway",
			"channels",
			channels.enabledChannels.length
				? channels.enabledChannels.join(",")
				: "none",
			undefined,
			undefined,
			false,
			true,
		);

		emitTrustStatus(emit, channels);

		if (verbose) {
			emit(
				"event",
				"gateway",
				"flags",
				`v=${String(verbose)} p=${String(printLogs)}`,
				undefined,
				undefined,
				false,
				true,
			);
		}

		if (lastActiveTargetRef.current) {
			const target = lastActiveTargetRef.current;
			emit(
				"event",
				"gateway",
				"target",
				`${target.channel}:${target.chatId}`,
				undefined,
				undefined,
				false,
				true,
			);
		}

		if (!channels.enabledChannels.length) {
			emit(
				"event",
				"gateway",
				"abort",
				"no channels",
				undefined,
				undefined,
				true,
				true,
			);
			return 1;
		}

		if (hasIdentityBinary()) {
			const identity = verifyDeviceIdentity();
			if (!identity.valid) {
				emit(
					"event",
					"gateway",
					"abort",
					`device identity failed: ${identity.reason}`,
					undefined,
					undefined,
					true,
					true,
				);
				return 1;
			}
			emit(
				"event",
				"gateway",
				"identity",
				"verified",
				undefined,
				undefined,
				false,
				true,
			);
		}

		ensureDailySummaryJob(cron);
		emit("heartbeat", "gateway", "alive");

		const enableWs = !boolFlag(flags, "no_ws", false);
		const { handler: webHandler } = await loadWebHandler(emit);

		const gwServer = await startGatewayWsServer(
			enableWs,
			webHandler,
			cfg,
			port,
			bus,
			channels,
			agent,
			emit,
			flags,
		);

		await cron.start();
		heartbeat.start();
		await channels.startAll();

		await new Promise<void>((resolve) => {
			const onSignal = () => resolve();
			process.once("SIGINT", onSignal);
			process.once("SIGTERM", onSignal);
		});

		runningRef.current = false;
		await consumer;
		if (gwServer) await gwServer.close();
		heartbeat.stop();
		cron.stop();
		await channels.stopAll();
		emit("event", "gateway", "stop", "", undefined, undefined, false, true);
		return 0;
	} finally {
		restoreConsole();
	}
};

export { localDate } from "./utils";

import type { CronService } from "@/cron/service";
