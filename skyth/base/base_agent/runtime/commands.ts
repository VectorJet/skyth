import { Session } from "@/session/manager";
import type { CommandResult, RuntimeContext, RuntimeInbound } from "@/base/base_agent/runtime/types";

export async function handleRuntimeCommand(params: {
  runtime: RuntimeContext;
  msg: RuntimeInbound;
  cmd: string;
  session: Session;
}): Promise<CommandResult> {
  if (params.cmd === "/new") {
    await params.runtime.waitForConsolidation(params.session.key);

    const snapshot = params.session.messages.slice(params.session.lastConsolidated);
    if (snapshot.length) {
      const temp = new Session(params.session.key);
      temp.messages = [...snapshot];
      const ok = await params.runtime.consolidateMemory(temp, true);
      if (!ok) {
        return {
          handled: true,
          response: {
            channel: params.msg.channel,
            chatId: params.msg.chatId,
            content: "Memory archival failed, session not cleared. Please try again.",
          },
        };
      }
    }

    params.session.clear();
    params.runtime.sessions.save(params.session);
    params.runtime.sessions.invalidate(params.session.key);
    params.runtime._consolidating.delete(params.session.key);
    params.runtime._consolidation_locks.delete(params.session.key);
    return {
      handled: true,
      response: { channel: params.msg.channel, chatId: params.msg.chatId, content: "New session started." },
    };
  }

  if (params.cmd === "/help") {
    return {
      handled: true,
      response: {
        channel: params.msg.channel,
        chatId: params.msg.chatId,
        content: "skyth commands:\n/new - start a new conversation\n/session-branch - show session graph\n/session-search <query> - search across sessions\n/help - show available commands",
      },
    };
  }

  return { handled: false, response: null };
}
