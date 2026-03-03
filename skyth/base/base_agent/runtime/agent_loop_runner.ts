import type { StreamCallback, LLMResponse } from "@/providers/base";
import { replyCoversOnboardingMissing, type OnboardingField } from "@/base/base_agent/onboarding/identity_check";
import { isIdentityFileWriteToolCall, isLikelyTaskDeferral, stripThink } from "@/base/base_agent/runtime/policies";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export async function runAgentLoop(params: {
  initialMessages: Array<Record<string, any>>;
  key: string;
  options?: {
    forceIdentityToolUse?: boolean;
    forceTaskPriority?: boolean;
    onboardingMissing?: OnboardingField[];
  };
  onStream?: StreamCallback;
  maxIterations: number;
  provider: any;
  tools: {
    getDefinitions(): Array<Record<string, any>>;
    execute(name: string, args: Record<string, any>, context?: Record<string, any>): Promise<string>;
  };
  toolContext?: ToolExecutionContext;
  workspace: string;
  context: {
    addAssistantMessage(
      messages: Array<Record<string, any>>,
      content: string | null,
      toolCalls: Array<Record<string, any>>,
      reasoningContent?: string | null,
    ): Array<Record<string, any>>;
    addToolResult(
      messages: Array<Record<string, any>>,
      toolCallId: string,
      name: string,
      result: string,
    ): Array<Record<string, any>>;
  };
  model: string;
  temperature: number;
  maxTokens: number;
  emit: (kind: string, scope: string, action: string, summary?: string, details?: Record<string, unknown>, key?: string) => void;
}): Promise<[string | null, string[], string | null]> {
  let messages = params.initialMessages;
  let iteration = 0;
  let finalContent: string | null = null;
  let finalReasoning: string | null = null;
  const toolsUsed: string[] = [];
  const identityWrites = new Set<"user.md" | "identity.md">();
  const recentCallSignatures: string[] = [];
  const LOOP_DETECT_WINDOW = 6;
  const LOOP_DETECT_THRESHOLD = 3;

  while (iteration < params.maxIterations) {
    iteration += 1;
    params.emit("event", "agent", "model", "chat", {}, params.key);
    const response: LLMResponse = params.onStream && typeof params.provider.streamChat === "function"
      ? await params.provider.streamChat({
          messages,
          tools: params.tools.getDefinitions(),
          model: params.model,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          onStream: params.onStream,
        })
      : await params.provider.chat({
          messages,
          tools: params.tools.getDefinitions(),
          model: params.model,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
        });

    if (response.reasoning_content) {
      finalReasoning = response.reasoning_content;
    }

    if (response.tool_calls.length) {
      const toolCallDicts = response.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      }));

      messages = params.context.addAssistantMessage(messages, response.content, toolCallDicts, response.reasoning_content ?? undefined);

      for (const toolCall of response.tool_calls) {
        const sig = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
        recentCallSignatures.push(sig);
        if (recentCallSignatures.length > LOOP_DETECT_WINDOW) recentCallSignatures.shift();
        const repeats = recentCallSignatures.filter((s) => s === sig).length;
        if (repeats >= LOOP_DETECT_THRESHOLD) {
          params.emit("event", "agent", "loop", `detected on ${toolCall.name}`, undefined, params.key);
          finalContent = response.content ?? "Completed the requested actions.";
          break;
        }

        params.emit("event", "agent", "tool", toolCall.name, {}, params.key);
        toolsUsed.push(toolCall.name);
        const written = isIdentityFileWriteToolCall(toolCall.name, toolCall.arguments);
        if (written) identityWrites.add(written);
        const result = await params.tools.execute(toolCall.name, toolCall.arguments, params.toolContext ?? { workspace: params.workspace });
        messages = params.context.addToolResult(messages, toolCall.id, toolCall.name, result);
      }
      if (finalContent) break;
    } else {
      if (params.options?.forceIdentityToolUse) {
        const needsUser = !identityWrites.has("user.md");
        const needsIdentity = !identityWrites.has("identity.md");
        if (needsUser || needsIdentity) {
          const targets = [
            needsUser ? "USER.md" : "",
            needsIdentity ? "IDENTITY.md" : "",
          ].filter(Boolean).join(" and ");
          messages.push({
            role: "user",
            content: `Tool enforcement: before final reply, use file tools to update ${targets} using identity details from the latest user message.`,
          });
          continue;
        }
      }
      const candidate = stripThink(response.content);
      if (!candidate) {
        messages.push({
          role: "user",
          content: toolsUsed.length
            ? "Final reply required: summarize completed actions for the user in 1-2 concise sentences. Do not call additional tools unless absolutely required."
            : "Final reply required: provide a concise direct reply to the user now.",
        });
        continue;
      }
      if (params.options?.onboardingMissing?.length && !replyCoversOnboardingMissing(candidate, params.options.onboardingMissing)) {
        const missing = params.options.onboardingMissing.join(", ");
        messages.push({
          role: "user",
          content: `Onboarding continuity: required identity fields still missing (${missing}). Reply naturally in your current persona and ask only for the missing field(s). Avoid meta wording like "onboarding incomplete".`,
        });
        continue;
      }
      if (params.options?.forceTaskPriority && !toolsUsed.length && isLikelyTaskDeferral(candidate)) {
        messages.push({
          role: "user",
          content: "Task priority enforcement: complete the requested task actions before replying. Do not announce future work. Execute required tools now, then reply with completed results.",
        });
        continue;
      }
      finalContent = candidate;
      params.emit("event", "agent", "send", finalContent ?? "", undefined, params.key);
      break;
    }
  }

  if (!finalContent && toolsUsed.length) {
    finalContent = "Done. Completed the requested updates.";
  }
  return [finalContent, toolsUsed, finalReasoning];
}
