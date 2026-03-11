import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { addNode, hasDeviceToken, secureCompare } from "@/auth/cmd/token/shared";

const LETTER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT_CHARS = "0123456789";
const PAIRING_PORT_START = 18798;
const PAIRING_PORT_END = 18810;

export function generatePairingCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 3; i++) {
    code += LETTER_CHARS[bytes[i]! % LETTER_CHARS.length]!;
  }
  code += "-";
  for (let i = 3; i < 6; i++) {
    code += DIGIT_CHARS[bytes[i]! % DIGIT_CHARS.length]!;
  }
  return code;
}

export function normalizePairingCode(value: string): string {
  return value.replace(/[^A-Z0-9]/g, "").toUpperCase();
}

interface PendingPairing {
  code: string;
  channel: string;
  resolve: (result: { success: boolean; nodeId?: string; nodeToken?: string; error?: string }) => void;
  deadline: number;
}

let pendingPairing: PendingPairing | null = null;
let server: ReturnType<typeof createServer> | null = null;

export async function startPairingEndpoint(
  channel: string,
  timeoutMs: number = 120000,
): Promise<{ code: string; url: string; close: () => Promise<void> }> {
  const code = generatePairingCode();
  const normalizedCode = normalizePairingCode(code);

  for (let port = PAIRING_PORT_START; port <= PAIRING_PORT_END; port++) {
    try {
      server = createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        
        if (req.method === "POST" && url.pathname === "/pair") {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
          }

          try {
            const data = JSON.parse(body);
            const receivedCode = normalizePairingCode(data.code || "");
            
            if (pendingPairing && secureCompare(receivedCode, normalizedCode) && pendingPairing.channel === channel) {
              if (Date.now() > pendingPairing.deadline) {
                res.writeHead(408, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: "Pairing timed out" }));
                return;
              }

              const node = addNode(channel, data.senderId || data.userId || "unknown", {
                ...data.metadata,
                paired_at: new Date().toISOString(),
              });

              pendingPairing.resolve({ success: true, nodeId: node.id, nodeToken: node.token });
              pendingPairing = null;

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, nodeId: node.id }));
            } else {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Invalid or expired pairing code" }));
            }
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Invalid request" }));
          }
          return;
        }

        if (req.method === "GET" && url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", channel, code: pendingPairing ? normalizedCode : null }));
          return;
        }

        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve, reject) => {
        server!.listen(port, "127.0.0.1", () => resolve());
        server!.on("error", reject);
      });

      pendingPairing = {
        code: normalizedCode,
        channel,
        resolve: () => {},
        deadline: Date.now() + timeoutMs,
      };

      return {
        code,
        url: `http://127.0.0.1:${port}`,
        close: async () => {
          pendingPairing = null;
          server?.close();
        },
      };
    } catch {
      continue;
    }
  }

  throw new Error("Could not find available port for pairing endpoint");
}

export async function waitForPairing(
  channel: string,
  timeoutMs: number = 120000,
): Promise<{ success: boolean; nodeId?: string; nodeToken?: string; error?: string }> {
  if (!hasDeviceToken()) {
    return { success: false, error: "No device token exists" };
  }

  return new Promise((resolve) => {
    if (!pendingPairing) {
      resolve({ success: false, error: "Pairing endpoint not started" });
      return;
    }

    pendingPairing.resolve = resolve;

    setTimeout(() => {
      if (pendingPairing) {
        pendingPairing.resolve({ success: false, error: "Pairing timed out" });
        pendingPairing = null;
      }
    }, timeoutMs);
  });
}
