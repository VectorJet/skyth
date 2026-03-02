import type { IncomingMessage, ServerResponse } from "node:http";
import { getNodeByToken } from "@/auth/cmd/token/shared";
import type { SessionManager } from "@/session/manager";

export async function handleGetSessionsRequest(req: IncomingMessage, res: ServerResponse, sessionManager: SessionManager): Promise<void> {
  const token = (req.headers.authorization || "").trim();
  const node = getNodeByToken(token);

  if (!node || node.channel !== "web") {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
    return;
  }

  try {
    const sessions = sessionManager.listSessions();
    // Only return web sessions or relevant ones
    const webSessions = sessions.filter(s => s.key.startsWith("web:"));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, sessions: webSessions }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: false, error: "Internal Server Error" }));
  }
}

export async function handleGetSessionHistoryRequest(req: IncomingMessage, res: ServerResponse, sessionManager: SessionManager): Promise<void> {
  const token = (req.headers.authorization || "").trim();
  const node = getNodeByToken(token);

  if (!node || node.channel !== "web") {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const chatId = url.searchParams.get("chatId");

  if (!chatId) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: false, error: "chatId is required" }));
    return;
  }

  try {
    const sessionKey = `web:${chatId}`;
    const session = sessionManager.getOrCreate(sessionKey);
    const history = session.getHistory();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, history }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: false, error: "Internal Server Error" }));
  }
}
