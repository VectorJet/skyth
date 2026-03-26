import { jsonSchema, tool, type ModelMessage } from "ai";
import { LLMProvider } from "@/providers/base";

export function normalizeToolCallId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!sanitized) return fallback;
  return sanitized.slice(0, 96);
}

export function parseToolArguments(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      // fall through
    }
  }
  return {};
}

export function toToolResultOutput(value: unknown): Record<string, any> {
  if (typeof value !== "string") {
    return { type: "json", value: value ?? null };
  }

  const text = value;
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object") {
      return { type: "json", value: parsed };
    }
  } catch {
    // keep as text
  }

  return { type: "text", value: text };
}

export function toMessages(input: Array<Record<string, unknown>>): ModelMessage[] {
  const sanitized = LLMProvider.sanitizeEmptyContent(input);
  const result: ModelMessage[] = [];
  const pendingToolCallIds: string[] = [];
  let autoToolCallCounter = 0;
  const nextFallbackToolCallId = (): string => {
    autoToolCallCounter += 1;
    return `call_${autoToolCallCounter}`;
  };

  for (const msg of sanitized) {
    const rawRole = msg.role === "system" || msg.role === "assistant" || msg.role === "tool" ? msg.role : "user";

    if (rawRole === "system") {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      result.push({ role: "system", content } as ModelMessage);
      continue;
    }

    if (rawRole === "assistant") {
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
        const parts: Array<Record<string, unknown>> = [];
        for (const call of msg.tool_calls) {
          const name = call?.function?.name ?? call?.name ?? "unknown_tool";
          const rawArgs = call?.function?.arguments ?? call?.arguments ?? "{}";
          const args = parseToolArguments(rawArgs);
          const toolCallId = normalizeToolCallId(
            call?.id ?? call?.toolCallId,
            nextFallbackToolCallId(),
          );
          pendingToolCallIds.push(toolCallId);
          parts.push({
            type: "tool-call",
            toolCallId,
            toolName: name,
            input: args,
          });
        }
        result.push({ role: "assistant", content: parts } as ModelMessage);
      } else {
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        result.push({ role: "assistant", content } as ModelMessage);
      }
      continue;
    }

    if (rawRole === "tool") {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      const queuedCallId = pendingToolCallIds.shift();
      const toolCallId = normalizeToolCallId(
        msg.tool_call_id ?? msg.toolCallId,
        queuedCallId ?? nextFallbackToolCallId(),
      );
      result.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId,
          toolName: msg.name ?? "unknown_tool",
          output: toToolResultOutput(content),
        }],
      } as ModelMessage);
      continue;
    }

    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    result.push({ role: "user", content } as ModelMessage);
  }

  return result;
}

export function toToolSet(tools?: Array<Record<string, any>>): Record<string, any> | undefined {
  if (!tools?.length) return undefined;
  const toolSet: Record<string, any> = {};

  for (const entry of tools) {
    const fn = entry?.function as Record<string, any> | undefined;
    const name = typeof fn?.name === "string" ? fn.name : "";
    if (!name) continue;
    const description = typeof fn?.description === "string" ? fn.description : undefined;
    const rawSchema = fn?.parameters;
    const isZodLike = Boolean(rawSchema)
      && typeof rawSchema === "object"
      && typeof (rawSchema as any).safeParse === "function";
    const schema = isZodLike
      ? rawSchema
      : (rawSchema && typeof rawSchema === "object"
        ? jsonSchema(rawSchema)
        : jsonSchema({ type: "object", properties: {} }));
    toolSet[name] = tool({
      description,
      inputSchema: schema,
    });
  }

  return Object.keys(toolSet).length ? toolSet : undefined;
}
