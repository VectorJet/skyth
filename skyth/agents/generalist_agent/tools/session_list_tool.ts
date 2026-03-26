/**
 * @tool session_list
 * @author skyth-team
 * @version 1.0.0
 * @description List all sessions with their token counts.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
  name: "session_list",
  description: "List all sessions with their token counts. Use this to see how much context each channel's session has.",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute(_params: Record<string, any>, ctx?: ToolExecutionContext): Promise<string> {
    if (!ctx?.sessions) return "Error: Session manager not available";

    const sessions = ctx.sessions.graph.getSessionList();
    const lines: string[] = ["Sessions:", ""];

    for (const { key, branch } of sessions) {
      const s = ctx.sessions.getOrCreate(key);
      const tokenCount = s.estimateTokenCount();
      const msgCount = s.messages.length;
      const mergedFrom = branch.mergedFrom.length > 0 ? ` (merged from: ${branch.mergedFrom.join(", ")})` : "";
      lines.push(`- ${key}: ${msgCount} messages, ~${tokenCount} tokens${mergedFrom}`);
    }

    if (sessions.length === 0) {
      lines.push("(no sessions)");
    }

    return lines.join("\n");
  },
});
