import { getNodeForSender, hasDeviceToken } from "@/auth/cmd/token/shared";

export interface InboundNodeAuthDecision {
  allowed: boolean;
  content: string;
  reason?: string;
  nodeId?: string;
}

export function authorizeInboundNodeMessage(params: {
  channel: string;
  senderId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): InboundNodeAuthDecision {
  const channel = String(params.channel ?? "").trim().toLowerCase();
  const senderId = String(params.senderId ?? "").trim();
  const content = String(params.content ?? "");

  if (!hasDeviceToken()) {
    return { allowed: true, content };
  }

  if (!channel || channel === "cli" || channel === "cron" || channel === "system") {
    return { allowed: true, content };
  }

  // If the message was already authenticated with a node token (e.g., via gateway WebSocket)
  if (params.metadata?.node_token_verified === true && params.metadata?.node_id) {
    return { allowed: true, content, nodeId: String(params.metadata.node_id) };
  }

  const node = getNodeForSender(channel, senderId);
  if (!node || !node.mfa_verified) {
    return { allowed: false, content, reason: "untrusted node" };
  }

  return { allowed: true, content, nodeId: node.id };
}
