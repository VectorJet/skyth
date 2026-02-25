import { execFile } from "node:child_process";
import * as os from "node:os";

export interface DiscoveredGateway {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
}

function exec(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
        if (err) {
          resolve("");
          return;
        }
        resolve(stdout ?? "");
      });
    } catch {
      resolve("");
    }
  });
}

function parseDnsSdOutput(output: string): DiscoveredGateway[] {
  const gateways: DiscoveredGateway[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Browsing") || trimmed.startsWith("DATE:") || trimmed.startsWith("Timestamp")) {
      continue;
    }
    // dns-sd -B output lines look like:
    //   <timestamp>  <flags>  <ifIndex>  <domain>  <type>  <instanceName>
    // Fields are whitespace-separated with the instance name at the end.
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length < 6) {
      continue;
    }
    const name = parts[parts.length - 1];
    if (!name) continue;
    gateways.push({
      name,
      host: "",
      port: 0,
      txt: {},
    });
  }
  return gateways;
}

function parseAvahiOutput(output: string): DiscoveredGateway[] {
  const gateways: DiscoveredGateway[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("+")) {
      continue;
    }
    // avahi-browse -p output uses semicolons:
    //   +;ifIndex;protocol;name;type;domain
    //   =;ifIndex;protocol;name;type;domain;host;address;port;txt
    const fields = trimmed.split(";");
    if (fields[0] === "=" && fields.length >= 9) {
      const txt: Record<string, string> = {};
      if (fields[9]) {
        for (const pair of fields[9].split(" ")) {
          const cleaned = pair.replace(/^"|"$/g, "");
          const eqIdx = cleaned.indexOf("=");
          if (eqIdx > 0) {
            txt[cleaned.slice(0, eqIdx)] = cleaned.slice(eqIdx + 1);
          }
        }
      }
      gateways.push({
        name: fields[3] ?? "",
        host: fields[6] ?? "",
        port: parseInt(fields[8], 10) || 0,
        txt,
      });
    } else if (fields.length >= 6) {
      gateways.push({
        name: fields[3] ?? "",
        host: "",
        port: 0,
        txt: {},
      });
    }
  }
  return gateways;
}

export async function discoverGateways(
  opts?: { timeoutMs?: number },
): Promise<DiscoveredGateway[]> {
  const timeout = opts?.timeoutMs ?? 5000;
  const platform = os.platform();

  if (platform === "darwin") {
    const output = await exec("dns-sd", ["-B", "_skyth-gw._tcp", "local"], timeout);
    if (output) {
      return parseDnsSdOutput(output);
    }
    return [];
  }

  if (platform === "linux") {
    const output = await exec("avahi-browse", ["-p", "-t", "_skyth-gw._tcp"], timeout);
    if (output) {
      return parseAvahiOutput(output);
    }
    return [];
  }

  return [];
}

export function formatDiscoveryTable(gateways: DiscoveredGateway[]): string {
  if (gateways.length === 0) {
    return "No Skyth gateways found on the local network.";
  }

  const header = ["Name", "Host", "Port", "Display Name"];
  const rows = gateways.map((gw) => [
    gw.name,
    gw.host || "-",
    gw.port > 0 ? String(gw.port) : "-",
    gw.txt.displayName || "-",
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const sep = widths.map((w) => "-".repeat(w)).join("--+-");
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

  const lines: string[] = [];
  lines.push(header.map((h, i) => pad(h, widths[i])).join("  | "));
  lines.push(sep);
  for (const row of rows) {
    lines.push(row.map((c, i) => pad(c, widths[i])).join("  | "));
  }

  return lines.join("\n");
}
