/**
 * @tool session_rebase
 * @author skyth-team
 * @version 1.0.0
 * @description Rebase current session on another session's history.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
  name: "session_rebase",
  description: "Rebase current session on another session's history. Like git rebase - replays current messages on top of source session.",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source session key to rebase onto (e.g., 'discord:12345')" },
    },
    required: ["source"],
  },
  async execute(params: Record<string, any>, ctx?: ToolExecutionContext): Promise<string> {
    if (!ctx?.sessions) return "Error: Session manager not available";
    const sourceKey = String(params.source);
    const targetKey = ctx.sessionKey;

    if (!sourceKey.includes(":")) {
      return "Error: Invalid session key format. Use 'channel:chatId' (e.g., 'discord:12345')";
    }

    const currentKeys = Array.from(ctx.sessions.graph.getSessions()).map(s => s.key);
    if (!currentKeys.includes(sourceKey)) {
      return `Error: Session '${sourceKey}' not found.`;
    }

    const sourceSession = ctx.sessions.getOrCreate(sourceKey);
    const targetSession = ctx.sessions.getOrCreate(targetKey);
    const sourceMessages = sourceSession.getHistory();
    const currentMessages = [...targetSession.messages];

    targetSession.messages = [...sourceMessages, ...currentMessages];
    ctx.sessions.save(targetSession);

    ctx.sessions.graph.merge(sourceKey, targetKey, "full", sourceSession.messages.length);
    ctx.sessions.graph.saveAll();

    return `Rebased current session on '${sourceKey}' with ${sourceSession.messages.length} messages.`;
  },
});
