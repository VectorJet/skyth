import * as os from "node:os";

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
  const state = typeof svc.serviceState === "string" ? svc.serviceState : "unknown";
  return `fqdn=${fqdn} host=${hostname} port=${port} state=${state}`;
}

function isDisabledByEnv(): boolean {
  if (process.env.SKYTH_DISABLE_BONJOUR === "1" || process.env.SKYTH_DISABLE_BONJOUR === "true") {
    return true;
  }
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  return false;
}

export async function startBonjourAdvertiser(
  opts: BonjourAdvertiseOpts,
): Promise<BonjourAdvertiser> {
  const noop: BonjourAdvertiser = { stop: async () => {} };

  if (isDisabledByEnv()) {
    return noop;
  }

  const { getResponder, Protocol } = await import("@homebridge/ciao");
  const responder = getResponder();

  const hostnameRaw =
    process.env.SKYTH_MDNS_HOSTNAME?.trim() || os.hostname();
  const hostname =
    hostnameRaw
      .replace(/\.local$/i, "")
      .split(".")[0]
      .trim() || "skyth";

  const instanceName =
    typeof opts.instanceName === "string" && opts.instanceName.trim()
      ? opts.instanceName.trim()
      : `${hostname} (Skyth)`;

  const displayName = opts.displayName?.trim() || instanceName;

  const svc = responder.createService({
    name: instanceName,
    type: "skyth-gw",
    protocol: Protocol.TCP,
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
      console.warn(`bonjour: name conflict resolved; newName=${JSON.stringify(next)}`);
    });
    svc.on("hostname-change", (nextHostname: unknown) => {
      const next = typeof nextHostname === "string" ? nextHostname : String(nextHostname);
      console.warn(`bonjour: hostname conflict resolved; newHostname=${JSON.stringify(next)}`);
    });
  } catch (err) {
    console.warn(`bonjour: failed to attach conflict listeners: ${String(err)}`);
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
        console.warn(`bonjour: advertise failed (${serviceSummary(svc)}): ${String(err)}`);
      });
  } catch (err) {
    console.warn(`bonjour: advertise threw (${serviceSummary(svc)}): ${String(err)}`);
  }

  const watchdog = setInterval(() => {
    const state = (svc as { serviceState?: unknown }).serviceState;
    if (typeof state !== "string") {
      return;
    }
    if (state === "announced" || state === "announcing") {
      return;
    }

    console.warn(
      `bonjour: watchdog detected non-announced service; attempting re-advertise (${serviceSummary(svc)})`,
    );
    try {
      void svc.advertise().catch((err) => {
        console.warn(`bonjour: watchdog re-advertise failed (${serviceSummary(svc)}): ${String(err)}`);
      });
    } catch (err) {
      console.warn(`bonjour: watchdog re-advertise threw (${serviceSummary(svc)}): ${String(err)}`);
    }
  }, 60_000);
  watchdog.unref?.();

  return {
    stop: async () => {
      clearInterval(watchdog);
      try {
        await svc.destroy();
      } catch {
        /* ignore */
      }
      try {
        await responder.shutdown();
      } catch {
        /* ignore */
      }
    },
  };
}
