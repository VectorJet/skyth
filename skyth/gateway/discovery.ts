import * as os from "node:os";
import { ignoreCiaoUnhandledRejection } from "@/gateway/bonjour-ciao";

const NOOP_ASYNC = async () => {};
const NOOP_VOID = () => {};

export type BonjourAdvertiser = {
	stop: () => Promise<void>;
};

export type BonjourAdvertiseOpts = {
	instanceName?: string;
	gatewayPort: number;
	displayName?: string;
};

type BonjourService = {
	advertise: () => Promise<void>;
	destroy: () => Promise<void>;
	getFQDN: () => string;
	getHostname: () => string;
	getPort: () => number;
	on: (event: string, listener: (...args: unknown[]) => void) => unknown;
	serviceState: string;
};

type BonjourResponder = {
	createService: (options: Record<string, unknown>) => BonjourService;
	shutdown: () => Promise<void>;
	advertiseService?: (...args: unknown[]) => unknown;
	announce?: (...args: unknown[]) => unknown;
	probe?: (...args: unknown[]) => unknown;
	republishService?: (...args: unknown[]) => unknown;
};

function serviceSummary(svc: BonjourService): string {
	let fqdn = "unknown";
	let hostname = "unknown";
	let port = -1;
	try {
		fqdn = svc.getFQDN();
	} catch {
		/* ignore */
	}
	try {
		hostname = svc.getHostname();
	} catch {
		/* ignore */
	}
	try {
		port = svc.getPort();
	} catch {
		/* ignore */
	}
	const state =
		typeof svc.serviceState === "string" ? svc.serviceState : "unknown";
	return `fqdn=${fqdn} host=${hostname} port=${port} state=${state}`;
}

function isDisabledByEnv(): boolean {
	if (
		process.env.SKYTH_DISABLE_BONJOUR === "1" ||
		process.env.SKYTH_DISABLE_BONJOUR === "true"
	) {
		return true;
	}
	if (process.env.NODE_ENV === "test") {
		return true;
	}
	return false;
}

let ciaoRejectionHandler: ((reason: unknown) => void) | null = null;

function installCiaoRejectionHandler(): () => void {
	// Only install once
	if (ciaoRejectionHandler) {
		return NOOP_VOID;
	}

	// Use 'uncaughtException' for synchronous errors and a wrapper for unhandled rejections
	// The key insight: we need to mark the rejection as "handled" BEFORE Node detects it
	// Since we can't do that reliably, we suppress stderr output for known ciao errors
	const originalWrite = process.stderr.write.bind(process.stderr);
	const rejectionHandler = (reason: unknown) => {
		if (ignoreCiaoUnhandledRejection(reason)) {
			// Silently ignore - the stderr.write override will suppress the output
			return;
		}
	};

	// Override stderr.write to suppress ciao cancellation messages
	// This avoids Node.js printing "PromiseRejectionHandledWarning" and the error itself
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const originalWriteFn = process.stderr.write.bind(process.stderr) as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	process.stderr.write = ((chunk: string | Buffer, ...rest: any[]): boolean => {
		// Check directly for ciao cancellation messages - this is more robust than
		// relying on suppressNext flag which can have race conditions
		if (typeof chunk === "string") {
			const upper = chunk.toUpperCase();
			if (
				upper.includes("CIAO PROBING CANCELLED") ||
				upper.includes("CIAO ANNOUNCEMENT CANCELLED")
			) {
				return true; // Suppress: pretend we wrote it
			}
		}
		return originalWriteFn(chunk, ...rest);
	}) as typeof process.stderr.write;

	ciaoRejectionHandler = rejectionHandler;
	process.on("unhandledRejection", rejectionHandler);

	return () => {
		process.off("unhandledRejection", rejectionHandler);
		process.stderr.write = originalWrite;
		ciaoRejectionHandler = null;
	};
}



export async function waitForCiaoShutdownSettling(): Promise<void> {
	// ciao cancellation rejections can surface on the next microtask/timer turn
	// after destroy()/shutdown() have already resolved.
	await Promise.resolve();
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

export function disarmCiaoResponder(responder: BonjourResponder): void {
	// ciao can queue retry callbacks while probe/announce are in flight.
	// Disarm those entrypoints before shutdown to avoid re-entering the responder during teardown.
	responder.advertiseService = NOOP_ASYNC;
	responder.announce = NOOP_ASYNC;
	responder.probe = NOOP_ASYNC;
	responder.republishService = NOOP_ASYNC;
}

export async function startBonjourAdvertiser(
	opts: BonjourAdvertiseOpts,
): Promise<BonjourAdvertiser> {
	const noop: BonjourAdvertiser = { stop: async () => {} };

	if (isDisabledByEnv()) {
		return noop;
	}

	const { getResponder, Protocol: Proto } = await import("@homebridge/ciao");
	const responder = getResponder() as unknown as BonjourResponder;
	const cleanupCiaoHandler = installCiaoRejectionHandler();

	const hostnameRaw = (process.env.SKYTH_MDNS_HOSTNAME?.trim() ??
		os.hostname()) as string;
	const hostname: string =
		(
			(hostnameRaw ?? "").replace(/\.local$/i, "").split(".")[0] ?? "localhost"
		).trim() || "skyth";

	const instanceName =
		typeof opts.instanceName === "string" && opts.instanceName.trim()
			? opts.instanceName.trim()
			: `${hostname} (Skyth)`;

	const displayName = opts.displayName?.trim() || instanceName;

	const svc = responder.createService({
		name: instanceName,
		type: "skyth-gw",
		protocol: "tcp" as (typeof Proto)[keyof typeof Proto],
		port: opts.gatewayPort,
		domain: "local",
		hostname,
		txt: {
			role: "gateway",
			gatewayPort: String(opts.gatewayPort),
			lanHost: `${hostname}.local`,
			displayName,
		},
	}) as unknown as BonjourService;

	try {
		svc.on("name-change", (name: unknown) => {
			const next = typeof name === "string" ? name : String(name);
			console.warn(
				`bonjour: name conflict resolved; newName=${JSON.stringify(next)}`,
			);
		});
		svc.on("hostname-change", (nextHostname: unknown) => {
			const next =
				typeof nextHostname === "string" ? nextHostname : String(nextHostname);
			console.warn(
				`bonjour: hostname conflict resolved; newHostname=${JSON.stringify(next)}`,
			);
		});
	} catch (err) {
		console.warn(
			`bonjour: failed to attach conflict listeners: ${String(err)}`,
		);
	}

	console.log(
		`bonjour: starting (hostname=${hostname}, instance=${JSON.stringify(instanceName)}, port=${opts.gatewayPort})`,
	);

	try {
		void svc
			.advertise()
			.then(() => {
				console.log(`bonjour: advertised ${serviceSummary(svc)}`);
			})
			.catch((err) => {
				console.warn(
					`bonjour: advertise failed (${serviceSummary(svc)}): ${String(err)}`,
				);
			});
	} catch (err) {
		console.warn(
			`bonjour: advertise threw (${serviceSummary(svc)}): ${String(err)}`,
		);
	}

	let consecutiveProbingCount = 0;
	const MAX_PROBING_RETRIES = 3;

	const watchdog = setInterval(() => {
		const state = (svc as { serviceState?: unknown }).serviceState;
		if (typeof state !== "string") {
			return;
		}
		if (state === "announced" || state === "announcing") {
			consecutiveProbingCount = 0; // Reset on success
			return;
		}

		// Service is stuck in probing - this typically happens when there's no IPv4 address
		// available on the network interfaces. Repeatedly calling advertise() just creates
		// more pending probes that get cancelled on shutdown.
		consecutiveProbingCount++;

		if (consecutiveProbingCount > MAX_PROBING_RETRIES) {
			// Stop re-advertising after multiple failures - the service is not working
			// and continuing just creates more mess on shutdown.
			console.warn(
				`bonjour: service stuck in probing state after ${MAX_PROBING_RETRIES} attempts; not re-advertising (${serviceSummary(svc)})`,
			);
			// Note: we don't clear the interval - we keep watching but don't re-advertise
			return;
		}

		console.warn(
			`bonjour: watchdog detected non-announced service; attempting re-advertise (${serviceSummary(svc)})`,
		);
		try {
			void svc.advertise().catch((err) => {
				// Don't log ciao cancellation errors - they're expected during shutdown
				if (!ignoreCiaoUnhandledRejection(err)) {
					console.warn(
						`bonjour: watchdog re-advertise failed (${serviceSummary(svc)}): ${String(err)}`,
					);
				}
			});
		} catch (err) {
			console.warn(
				`bonjour: watchdog re-advertise threw (${serviceSummary(svc)}): ${String(err)}`,
			);
		}
	}, 60_000);
	watchdog.unref?.();

	return {
		stop: async () => {
			clearInterval(watchdog);
			disarmCiaoResponder(responder);
			try {
				await svc.destroy();
			} catch {
				/* ignore */
			}
			try {
				await responder.shutdown();
			} catch {
				/* ignore */
			} finally {
				await waitForCiaoShutdownSettling();
				cleanupCiaoHandler();
			}
		},
	};
}
