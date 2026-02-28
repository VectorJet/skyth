import { randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { EventEmitter } from "node:events";

const LETTER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT_CHARS = "0123456789";
const PAIRING_PORT_START = 18798;
const PAIRING_PORT_END = 18810;

export interface PairingResult {
  status: "paired" | "timeout" | "error";
  channel: string;
  senderId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PairingRequest {
  code: string;
  channel: string;
  senderId: string;
  chatId?: string;
  metadata?: Record<string, unknown>;
}

export interface PairingEvents {
  "pairing-request": (request: PairingRequest) => void;
  "pairing-complete": (result: PairingResult) => void;
}

export class PairingManager extends EventEmitter {
  private server: HttpServer | null = null;
  private currentCode: string | null = null;
  private currentChannel: string | null = null;
  private deadline = 0;
  private resolvePairing: ((result: PairingResult) => void) | null = null;

  constructor() {
    super();
  }

  generateCode(): string {
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

  normalizeCode(value: string): string {
    return value.replace(/[^A-Z0-9]/g, "").toUpperCase();
  }

  async start(channel: string, timeoutMs: number = 120000): Promise<{ code: string; url: string }> {
    if (this.server) {
      await this.stop();
    }

    const code = this.generateCode();
    const normalizedCode = this.normalizeCode(code);
    this.currentCode = normalizedCode;
    this.currentChannel = channel;
    this.deadline = Date.now() + timeoutMs;

    for (let port = PAIRING_PORT_START; port <= PAIRING_PORT_END; port++) {
      try {
        this.server = createServer(async (req, res) => {
          const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
          
          if (req.method === "POST" && url.pathname === "/pair") {
            let body = "";
            for await (const chunk of req) {
              body += chunk;
            }

            try {
              const data = JSON.parse(body);
              const receivedCode = this.normalizeCode(data.code || "");
              
              if (this.currentCode && receivedCode === this.currentCode && this.currentChannel === channel) {
                if (Date.now() > this.deadline) {
                  res.writeHead(408, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ success: false, error: "Pairing timed out" }));
                  return;
                }

                const result: PairingResult = {
                  status: "paired",
                  channel: channel,
                  senderId: data.senderId || data.userId || "unknown",
                  metadata: {
                    ...data.metadata,
                    paired_at: new Date().toISOString(),
                  },
                };

                this.emit("pairing-complete", result);
                
                if (this.resolvePairing) {
                  this.resolvePairing(result);
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
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

          if (req.method === "GET" && url.pathname === "/code") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              code: this.currentCode, 
              channel: this.currentChannel,
              active: this.currentCode !== null && Date.now() < this.deadline 
            }));
            return;
          }

          if (req.method === "GET" && url.pathname === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", pairing: this.currentCode !== null }));
            return;
          }

          res.writeHead(404);
          res.end();
        });

        await new Promise<void>((resolve, reject) => {
          this.server!.listen(port, "127.0.0.1", () => resolve());
          this.server!.on("error", reject);
        });

        return {
          code,
          url: `http://127.0.0.1:${port}`,
        };
      } catch {
        continue;
      }
    }

    throw new Error("Could not find available port for pairing server");
  }

  async awaitResult(timeoutMs: number = 120000): Promise<PairingResult> {
    if (!this.currentCode || !this.currentChannel) {
      return { status: "error", channel: "", error: "Pairing server not started" };
    }

    const channel = this.currentChannel;

    return new Promise((resolve) => {
      this.resolvePairing = resolve;

      setTimeout(() => {
        const result: PairingResult = {
          status: "timeout",
          channel,
          error: "Pairing timed out",
        };

        this.emit("pairing-complete", result);

        if (this.resolvePairing) {
          this.resolvePairing(result);
          this.resolvePairing = null;
        }

        this.stop();
      }, timeoutMs);
    });
  }

  async waitForPairing(channel: string, timeoutMs: number = 120000): Promise<PairingResult> {
    await this.start(channel, timeoutMs);
    return this.awaitResult(timeoutMs);
  }

  async stop(): Promise<void> {
    this.currentCode = null;
    this.currentChannel = null;
    this.resolvePairing = null;
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  isActive(): boolean {
    return this.currentCode !== null && Date.now() < this.deadline;
  }

  getCurrentCode(): string | null {
    if (!this.isActive()) return null;
    return this.currentCode;
  }

  checkAndPair(content: string, channel: string, senderId: string, chatId?: string, metadata?: Record<string, unknown>): boolean {
    if (!this.currentCode || this.currentChannel !== channel || !this.isActive()) {
      return false;
    }

    const pairingCode = this.extractPairingCode(content);
    if (!pairingCode) {
      return false;
    }

    const normalizedInput = this.normalizeCode(pairingCode);
    
    if (normalizedInput === this.currentCode) {
      const result: PairingResult = {
        status: "paired",
        channel: channel,
        senderId,
        metadata: {
          ...metadata,
          paired_at: new Date().toISOString(),
        },
      };

      this.emit("pairing-complete", result);
      
      if (this.resolvePairing) {
        this.resolvePairing(result);
        this.resolvePairing = null;
      }

      return true;
    }

    return false;
  }

  extractPairingCode(content: string): string | null {
    const trimmed = content.trim();
    if (!trimmed) return null;

    const startMatch = trimmed.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/i);
    if (startMatch) {
      const arg = (startMatch[1] ?? "").trim();
      const normalized = arg.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (normalized && /^[A-Z]{3}\d{3}$/.test(normalized)) {
        return normalized;
      }
      return null;
    }

    const normalized = trimmed.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (/^[A-Z]{3}\d{3}$/.test(normalized)) {
      return normalized;
    }

    return null;
  }
}

export const globalPairingManager = new PairingManager();
