export function validateSessionKey(sessionKey: string): string | null {
  return sessionKey.includes(":")
    ? null
    : "Error: Invalid session key format. Use 'channel:chatId' (e.g., 'discord:12345')";
}

export function buildCompactMergeSummary(
  sourceKey: string,
  messages: Array<{ role: string; content: unknown }>,
): string {
  const recentMessages = messages.slice(-10);
  const userMsgs = recentMessages.filter((m) => m.role === "user").map((m) => String(m.content ?? ""));
  const lastUserMsg = userMsgs[userMsgs.length - 1];
  const lastUser = lastUserMsg ? lastUserMsg.slice(0, 200) : "";
  return `=== SESSION MERGE ===\nSource: ${sourceKey}\nMessages: ${messages.length}\nLast user message: "${lastUser}"\n=== END MERGE ===`;
}

export function searchSessionMessages(
  sessions: Array<{ key: string; messages: Array<{ role: string; content: unknown }> }>,
  query: string,
  limit: number,
): Array<{ session: string; role: string; content: string }> {
  const results: Array<{ session: string; role: string; content: string }> = [];
  for (const session of sessions) {
    for (const msg of session.messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      if (content.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          session: session.key,
          role: msg.role,
          content: content.slice(0, 200),
        });
        if (results.length >= limit * sessions.length) break;
      }
    }
  }
  return results;
}

export function formatSessionList(
  sessions: Array<{ key: string; branch: { mergedFrom: string[] } }>,
  stats: Record<string, { messageCount: number; tokenCount: number }>,
): string {
  const lines: string[] = ["Sessions:", ""];
  for (const { key, branch } of sessions) {
    const sessionStats = stats[key] ?? { messageCount: 0, tokenCount: 0 };
    const mergedFrom = branch.mergedFrom.length > 0 ? ` (merged from: ${branch.mergedFrom.join(", ")})` : "";
    lines.push(`- ${key}: ${sessionStats.messageCount} messages, ~${sessionStats.tokenCount} tokens${mergedFrom}`);
  }
  if (sessions.length === 0) {
    lines.push("(no sessions)");
  }
  return lines.join("\n");
}
