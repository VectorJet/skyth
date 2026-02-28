import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { MessageBus } from "@/bus/queue";
import type { GatewayClient } from "@/gateway/protocol";
import { MAX_PAYLOAD_BYTES } from "@/gateway/protocol";
import { attachWsConnectionHandler } from "@/gateway/ws-connection";
import { startBonjourAdvertiser, type BonjourAdvertiser } from "@/gateway/discovery";

export interface GatewayServerOpts {
  host: string;
  port: number;
  bus: MessageBus;
  validateToken: (token: string) => boolean;
  enableDiscovery?: boolean;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
  };
  webHandler?: (req: import("http").IncomingMessage, res: import("http").ServerResponse) => void | Promise<void>;
}

export interface GatewayServer {
  httpServer: HttpServer;
  wss: WebSocketServer;
  clients: Set<GatewayClient>;
  broadcast: (event: string, payload?: unknown) => void;
  close: () => Promise<void>;
}

const GATEWAY_METHODS = [
  "chat.send",
  "chat.history",
  "health",
  "status",
] as const;

export async function startGatewayServer(opts: GatewayServerOpts): Promise<GatewayServer> {
  const { host, port, bus, validateToken, log, webHandler } = opts;
  const clients = new Set<GatewayClient>();
  let bonjourAdvertiser: BonjourAdvertiser | null = null;

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        status: "ok",
        clients: clients.size,
        uptime: process.uptime(),
      }));
      return;
    }

    if (url.pathname === "/status") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        clients: clients.size,
        inboundQueue: bus.inboundSize,
        outboundQueue: bus.outboundSize,
      }));
      return;
    }

    if (webHandler && (req.method === "GET" || req.method === "POST") && !url.pathname.startsWith("/api/")) {
      await webHandler(req, res);
      return;
    }

    if (String(req.headers.upgrade ?? "").toLowerCase() === "websocket") {
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });

  httpServer.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  attachWsConnectionHandler({
    wss,
    clients,
    gatewayMethods: [...GATEWAY_METHODS],
    validateToken,
    handleRequest: async (method, params, client) => {
      if (method === "health") {
        return { status: "ok", clients: clients.size, uptime: process.uptime() };
      }
      if (method === "status") {
        return {
          clients: clients.size,
          inboundQueue: bus.inboundSize,
          outboundQueue: bus.outboundSize,
        };
      }
      if (method === "chat.send") {
        const p = params as { content?: string; channel?: string; chatId?: string } | undefined;
        if (!p?.content) {
          throw new Error("content is required");
        }
        await bus.publishInbound({
          channel: p.channel ?? "gateway",
          senderId: client.connId,
          chatId: p.chatId ?? client.connId,
          content: p.content,
          metadata: { source: "gateway", connId: client.connId },
        });
        return { queued: true };
      }
      throw new Error(`unknown method: ${method}`);
    },
    onDisconnect: (client) => {
      log.info(`client disconnected conn=${client.connId}`);
    },
    log,
  });

  const broadcast = (event: string, payload?: unknown) => {
    const frame = JSON.stringify({ type: "event", event, payload });
    for (const client of clients) {
      if (client.authenticatedAt) {
        try {
          client.socket.send(frame);
        } catch {
          /* skip dead connections */
        }
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  log.info(`gateway server listening on ${host}:${port}`);

  if (opts.enableDiscovery !== false) {
    try {
      bonjourAdvertiser = await startBonjourAdvertiser({
        gatewayPort: port,
      });
    } catch (err) {
      log.warn(`bonjour advertising failed: ${String(err)}`);
    }
  }

  const close = async () => {
    if (bonjourAdvertiser) {
      await bonjourAdvertiser.stop();
    }
    for (const client of clients) {
      try {
        client.socket.close(1001, "server-shutdown");
      } catch {
        /* ignore */
      }
    }
    clients.clear();
    wss.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    log.info("gateway server stopped");
  };

  return { httpServer, wss, clients, broadcast, close };
}
