import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { secureCompare } from "./shared";

const LETTER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT_CHARS = "0123456789";
const PAIRING_PORT_START = 18798;
const PAIRING_PORT_END = 18810;

export interface PairingResult {
  status: "paired" | "timeout" | "error";
  senderId?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PairingServer {
  code: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

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

export async function startPairingServer(
  channel: string,
  timeoutMs: number = 120000,
): Promise<{ server: PairingServer; result: Promise<PairingResult> }> {
  const code = generatePairingCode();
  const normalizedCode = normalizePairingCode(code);

  let port = PAIRING_PORT_START;
  let server: HttpServer | null = null;
  let wss: WebSocketServer | null = null;

  for (port = PAIRING_PORT_START; port <= PAIRING_PORT_END; port++) {
    try {
      server = createServer();
      wss = new WebSocketServer({ noServer: true });
      
      await new Promise<void>((resolve, reject) => {
        server!.on("error", reject);
        server!.listen(port, "127.0.0.1", () => resolve());
      });
      break;
    } catch {
      server = null;
      wss = null;
    }
  }

  if (!server || !wss) {
    throw new Error("Could not find available port for pairing server");
  }

  const deadline = Date.now() + timeoutMs;
  
  let resolvePairing: ((result: PairingResult) => void) | null = null;
  let rejectPairing: ((error: Error) => void) | null = null;

  const resultPromise = new Promise<PairingResult>((resolve, reject) => {
    resolvePairing = resolve;
    rejectPairing = reject;
  });

  const cleanup = (): void => {
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
    }
    if (server) {
      server.close();
    }
  };

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "pair") {
          const receivedCode = normalizePairingCode(message.code || "");
          
          if (secureCompare(receivedCode, normalizedCode)) {
            const pairingResult: PairingResult = {
              status: "paired",
              senderId: message.senderId || message.userId || "unknown",
              channel: channel,
              metadata: message.metadata || {},
            };
            
            if (resolvePairing) {
              resolvePairing(pairingResult);
            }
            
            ws.send(JSON.stringify({ type: "paired", success: true, message: "Device paired successfully" }));
            setTimeout(cleanup, 500);
          } else {
            ws.send(JSON.stringify({ type: "error", message: "Invalid pairing code" }));
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", `http://127.0.0.1:${port}`);
    
    if (url.pathname === "/pair" || url.pathname === "/") {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  const checkTimeout = setInterval(() => {
    if (Date.now() > deadline) {
      if (resolvePairing) {
        resolvePairing({ status: "timeout", error: "Pairing timed out" });
      }
      cleanup();
      clearInterval(checkTimeout);
    }
  }, 1000);

  const finalPromise = resultPromise.finally(() => {
    clearInterval(checkTimeout);
  });

  return {
    server: {
      code,
      port,
      url: `ws://127.0.0.1:${port}/pair`,
      close: async () => {
        cleanup();
        await finalPromise;
      },
    },
    result: finalPromise,
  };
}

export async function waitForChannelPairing(
  channel: string,
  timeoutMs: number = 120000,
  onProgress?: (code: string, port: number) => void,
): Promise<PairingResult> {
  const { server, result } = await startPairingServer(channel, timeoutMs);
  
  if (onProgress) {
    onProgress(server.code, server.port);
  }

  try {
    return await result;
  } finally {
    await server.close();
  }
}
