import { generateText, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LLMProvider, LLMResponse } from "./base";
import { findByModel, findGateway, loadModelsDevCatalog, parseModelRef } from "./registry";

export class AISDKProvider extends LLMProvider {
  private readonly defaultModel: string;
  private readonly gateway;

  constructor(params: { api_key?: string; api_base?: string; default_model?: string; provider_name?: string } = {}) {
    super(params.api_key, params.api_base);
    this.defaultModel = params.default_model ?? "anthropic/claude-opus-4-5";
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

  private toMessages(input: Array<Record<string, any>>): ModelMessage[] {
    return LLMProvider.sanitizeEmptyContent(input).map((msg) => {
      const rawRole = msg.role === "system" || msg.role === "assistant" || msg.role === "tool" ? msg.role : "user";
      const role = rawRole === "tool" ? "user" : rawRole;
      const baseContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      const content = rawRole === "tool" ? `Tool result: ${baseContent}` : baseContent;
      return { role, content } as ModelMessage;
    });
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
      const result = await generateText({
        model,
        messages: this.toMessages(params.messages),
        maxOutputTokens: params.max_tokens,
        temperature: params.temperature,
      });
      return {
        content: result.text,
        tool_calls: [],
        finish_reason: "stop",
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

  getDefaultModel(): string {
    return this.defaultModel;
  }
}
