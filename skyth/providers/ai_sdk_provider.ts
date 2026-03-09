import { generateText, streamText, jsonSchema, tool, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LLMProvider, type LLMResponse, type StreamCallback } from "@/providers/base";
import { findByModel, findGateway, loadModelsDevCatalog, parseModelRef } from "@/providers/registry";

export class AISDKProvider extends LLMProvider {
  private readonly defaultModel: string;
  private readonly gateway;

  constructor(params: { api_key?: string; api_base?: string; default_model?: string; provider_name?: string } = {}) {
    super(params.api_key, params.api_base);
    this.defaultModel = params.default_model ?? "anthropic/claude-opus-4-6";
    this.gateway = findGateway(params.provider_name, params.api_key, params.api_base);
  }

  canonicalizeExplicitPrefix(model: string, specName: string, canonicalPrefix: string): string {
    const slash = model.indexOf("/");
    if (slash === -1) return model;
    const prefix = model.slice(0, slash);
    const rest = model.slice(slash + 1);
    if (prefix.toLowerCase().replaceAll("-", "_") !== specName) return model;
    return `${canonicalPrefix}/${rest}`;
  }

  resolveModel(model: string): string {
    if (this.gateway) {
      const prefix = this.gateway.model_prefix ?? "";
      const routed = this.gateway.strip_model_prefix ? model.split("/").at(-1) ?? model : model;
      return prefix && !routed.startsWith(`${prefix}/`) ? `${prefix}/${routed}` : routed;
    }

    const spec = findByModel(model);
    if (spec?.model_prefix) {
      const canonical = this.canonicalizeExplicitPrefix(model, spec.name, spec.model_prefix);
      const skip = spec.skip_prefixes ?? [];
      if (!skip.some((p) => canonical.startsWith(p))) return `${spec.model_prefix}/${canonical}`;
      return canonical;
    }

    return model;
  }

  private normalizeToolCallId(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!sanitized) return fallback;
    return sanitized.slice(0, 96);
  }

  private parseToolArguments(value: unknown): Record<string, any> {
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

  private toToolResultOutput(value: unknown): Record<string, any> {
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

  private toMessages(input: Array<Record<string, any>>): ModelMessage[] {
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
          const parts: Array<Record<string, any>> = [];
          for (const call of msg.tool_calls) {
            const name = call?.function?.name ?? call?.name ?? "unknown_tool";
            const rawArgs = call?.function?.arguments ?? call?.arguments ?? "{}";
            const args = this.parseToolArguments(rawArgs);
            const toolCallId = this.normalizeToolCallId(
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
        const toolCallId = this.normalizeToolCallId(
          msg.tool_call_id ?? msg.toolCallId,
          queuedCallId ?? nextFallbackToolCallId(),
        );
        result.push({
          role: "tool",
          content: [{
            type: "tool-result",
            toolCallId,
            toolName: msg.name ?? "unknown_tool",
            output: this.toToolResultOutput(content),
          }],
        } as ModelMessage);
        continue;
      }

      // user
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      result.push({ role: "user", content } as ModelMessage);
    }

    return result;
  }

  private toToolSet(tools?: Array<Record<string, any>>): Record<string, any> | undefined {
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

  private isNoOutputError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes("no output generated")
      || m.includes("no output specified")
      || m.includes("failed after 3 attempts");
  }

  private trimMessagesForRetry(messages: Array<Record<string, any>>, keep = 14): Array<Record<string, any>> {
    if (messages.length <= keep + 1) return messages;
    const system = messages.filter((m) => String(m?.role ?? "") === "system");
    const nonSystem = messages.filter((m) => String(m?.role ?? "") !== "system");
    const tail = nonSystem.slice(-keep);
    return [...system, ...tail];
  }

  private async resolveProviderModel(modelRef: string, apiKey?: string, apiBase?: string): Promise<any> {
    const { providerID, modelID } = parseModelRef(modelRef);
    const catalog = await loadModelsDevCatalog();
    const dynamic = catalog[providerID];
    const modelMeta = dynamic?.models?.[modelID];

    if (providerID === "openai") {
      const sdk = createOpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY || process.env.API_KEY,
        baseURL: apiBase,
      });
      return sdk(modelID);
    }

    if (providerID === "anthropic") {
      const sdk = createAnthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY || process.env.API_KEY,
        baseURL: apiBase,
      });
      return sdk(modelID);
    }

    if (providerID === "groq") {
      const sdk = createOpenAICompatible({
        name: "groq",
        apiKey: apiKey || process.env.GROQ_API_KEY || process.env.API_KEY,
        baseURL: apiBase || "https://api.groq.com/openai/v1",
      });
      return sdk(modelID);
    }

    const baseURL = apiBase || dynamic?.api || modelMeta?.provider?.api || undefined;
    const key = apiKey || process.env[`${providerID.toUpperCase()}_API_KEY`] || process.env.API_KEY || process.env.OPENAI_API_KEY;
    if (!baseURL) {
      throw new Error(`No API base URL found for provider '${providerID}'. Set provider api_base in config or use a native AI SDK provider.`);
    }
    const sdk = createOpenAICompatible({
      name: providerID,
      apiKey: key,
      baseURL,
    });
    return sdk(modelID);
  }

  async chat(params: { messages: Array<Record<string, any>>; tools?: Array<Record<string, any>>; model?: string; max_tokens?: number; temperature?: number; }): Promise<LLMResponse> {
    const content = params.messages.at(-1)?.content;
    if (typeof content === "string" && content.startsWith("mock:")) {
      return { content: content.slice(5), tool_calls: [], finish_reason: "stop" };
    }

    try {
      const requested = params.model ?? this.defaultModel;
      const resolved = this.resolveModel(requested);
      const model = await this.resolveProviderModel(resolved, this.apiKey, this.apiBase);
      const run = async (messages: Array<Record<string, any>>, toolsInput?: Array<Record<string, any>>) => {
        const tools = this.toToolSet(toolsInput);
        return await generateText({
          model,
          messages: this.toMessages(messages),
          tools,
          toolChoice: tools ? "auto" : "none",
          maxRetries: 0,
          maxOutputTokens: params.max_tokens,
          temperature: params.temperature,
        });
      };

      let result;
      try {
        result = await run(params.messages, params.tools);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!this.isNoOutputError(message)) throw error;
        const trimmed = this.trimMessagesForRetry(params.messages);
        result = await run(trimmed, undefined);
      }

      const toolCalls = result.toolCalls.map((call, index) => ({
        id: this.normalizeToolCallId(call.toolCallId, `call_${index + 1}`),
        name: call.toolName,
        arguments: this.parseToolArguments(call.input),
      }));

      return {
        content: result.text,
        tool_calls: toolCalls,
        finish_reason: result.finishReason || "stop",
        reasoning_content: (result as any).reasoningText ?? null,
        usage: result.usage
          ? {
            input_tokens: result.usage.inputTokens ?? 0,
              output_tokens: result.usage.outputTokens ?? 0,
              total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
            }
          : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed";
      return { content: `Provider error: ${message}`, tool_calls: [], finish_reason: "stop" };
    }
  }

  async streamChat(params: {
    messages: Array<Record<string, any>>;
    tools?: Array<Record<string, any>>;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    onStream: StreamCallback;
  }): Promise<LLMResponse> {
    const content = params.messages.at(-1)?.content;
    if (typeof content === "string" && content.startsWith("mock:")) {
      const response: LLMResponse = { content: content.slice(5), tool_calls: [], finish_reason: "stop" };
      params.onStream({ type: "done", response });
      return response;
    }



    try {
      const requested = params.model ?? this.defaultModel;
      const resolved = this.resolveModel(requested);
      const model = await this.resolveProviderModel(resolved, this.apiKey, this.apiBase);
      const tools = this.toToolSet(params.tools);
      const result = streamText({
        model,
        messages: this.toMessages(params.messages),
        tools,
        toolChoice: tools ? "auto" : "none",
        maxRetries: 0,
        maxOutputTokens: params.max_tokens,
        temperature: params.temperature,
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          params.onStream({ type: "text-delta", text: part.text });
        } else if (part.type === "reasoning-delta") {
          params.onStream({ type: "reasoning-delta", text: part.text });
        } else if ((part as any).type === "tool-call-streaming-start") {
          params.onStream({ type: "tool-call", toolCallId: (part as any).toolCallId, toolName: (part as any).toolName, args: "" });
        } else if ((part as any).type === "tool-call-delta") {
          params.onStream({ type: "tool-call", toolCallId: (part as any).toolCallId, toolName: (part as any).toolName, args: (part as any).argsTextDelta });
        } else if (part.type === "tool-call") {
          // Send full stringified args for completeness
          params.onStream({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, args: JSON.stringify((part as any).args) });
        } else if (part.type === "tool-result") {
          params.onStream({ type: "tool-result", toolCallId: part.toolCallId, result: (part as any).result });
        }
      }

      const [text, finishReason, usage, resolvedToolCalls, reasoningText] = await Promise.all([
        result.text,
        result.finishReason,
        result.usage,
        result.toolCalls,
        (result as any).reasoningText,
      ]);

      const toolCalls = (resolvedToolCalls ?? []).map((call: any, index: number) => ({
        id: this.normalizeToolCallId(call.toolCallId, `call_${index + 1}`),
        name: call.toolName,
        arguments: this.parseToolArguments(call.input),
      }));

      const response: LLMResponse = {
        content: text,
        tool_calls: toolCalls,
        finish_reason: finishReason || "stop",
        reasoning_content: reasoningText ?? null,
        usage: usage
          ? {
              input_tokens: usage.inputTokens ?? 0,
              output_tokens: usage.outputTokens ?? 0,
              total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            }
          : undefined,
      };

      params.onStream({ type: "done", response });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed";
      if (this.isNoOutputError(message)) {
        try {
          const fallback = await this.chat({
            messages: this.trimMessagesForRetry(params.messages),
            tools: undefined,
            model: params.model,
            max_tokens: params.max_tokens,
            temperature: params.temperature,
          });
          params.onStream({ type: "done", response: fallback });
          return fallback;
        } catch {
          // fall through to provider error response
        }
      }
      const response: LLMResponse = { content: `Provider error: ${message}`, tool_calls: [], finish_reason: "stop" };
      params.onStream({ type: "done", response });
      return response;
    }
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }
}
