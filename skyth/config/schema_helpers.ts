import type { ProviderConfig } from "@/config/schema";

export function providerDefaults(): ProviderConfig {
	return { api_key: "" };
}

export function normalizeLegacyKeys(
	data: Record<string, any>,
): Record<string, any> {
	const out = structuredClone(data);
	const channels = out.channels ?? {};
	if (channels.web?.allowFrom && !channels.web.allow_from) {
		channels.web.allow_from = channels.web.allowFrom;
	}
	if (channels.whatsapp?.allowFrom && !channels.whatsapp.allow_from) {
		channels.whatsapp.allow_from = channels.whatsapp.allowFrom;
	}
	if (channels.telegram?.allowFrom && !channels.telegram.allow_from) {
		channels.telegram.allow_from = channels.telegram.allowFrom;
	}
	if (channels.discord?.allowFrom && !channels.discord.allow_from) {
		channels.discord.allow_from = channels.discord.allowFrom;
	}
	if (channels.feishu?.allowFrom && !channels.feishu.allow_from) {
		channels.feishu.allow_from = channels.feishu.allowFrom;
	}
	if (channels.dingtalk?.allowFrom && !channels.dingtalk.allow_from) {
		channels.dingtalk.allow_from = channels.dingtalk.allowFrom;
	}
	if (channels.slack?.groupAllowFrom && !channels.slack.group_allow_from) {
		channels.slack.group_allow_from = channels.slack.groupAllowFrom;
	}
	if (channels.slack?.dm?.allowFrom && !channels.slack.dm.allow_from) {
		channels.slack.dm.allow_from = channels.slack.dm.allowFrom;
	}
	if (channels.qq?.allowFrom && !channels.qq.allow_from) {
		channels.qq.allow_from = channels.qq.allowFrom;
	}
	if (channels.email?.allowFrom && !channels.email.allow_from) {
		channels.email.allow_from = channels.email.allowFrom;
	}
	out.channels = channels;

	const providers = out.providers ?? {};
	for (const [key, value] of Object.entries(providers)) {
		if (
			value &&
			typeof value === "object" &&
			(value as any).apiKey &&
			!(value as any).api_key
		) {
			(value as any).api_key = (value as any).apiKey;
		}
		providers[key] = value;
	}
	out.providers = providers;

	const tools = out.tools ?? {};
	if (tools.mcpServers && !tools.mcp_servers)
		tools.mcp_servers = tools.mcpServers;
	if (tools.mcp_servers && typeof tools.mcp_servers === "object") {
		for (const value of Object.values(
			tools.mcp_servers as Record<string, any>,
		)) {
			if (
				value &&
				typeof value === "object" &&
				value.toolTimeout !== undefined &&
				value.tool_timeout === undefined
			) {
				value.tool_timeout = value.toolTimeout;
			}
		}
	}
	out.tools = tools;
	return out;
}
