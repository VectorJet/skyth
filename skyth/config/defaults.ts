import { join } from "node:path";
import { homedir } from "node:os";

export const DEFAULT_WORKSPACE = join(homedir(), ".skyth", "workspace");
export const DEFAULT_MODEL = "anthropic/claude-opus-4-5";
export const DEFAULT_MAX_TOKENS = 8192;
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOOL_ITERATIONS = 200;
export const DEFAULT_STEPS = 50;
export const DEFAULT_MEMORY_WINDOW = 50;

export const DEFAULT_IMAP_PORT = 993;
export const DEFAULT_SMTP_PORT = 587;
export const DEFAULT_IMAP_USE_SSL = true;
export const DEFAULT_SMTP_USE_TLS = true;
export const DEFAULT_SMTP_USE_SSL = false;
export const DEFAULT_POLL_INTERVAL = 30;
export const DEFAULT_MARK_SEEN = true;
export const DEFAULT_MAX_BODY_CHARS = 12000;
export const DEFAULT_SUBJECT_PREFIX = "Re: ";

export const DEFAULT_GATEWAY_HOST = "0.0.0.0";
export const DEFAULT_GATEWAY_PORT = 18790;
export const DEFAULT_MDNS_MODE = "minimal" as const;

export const DEFAULT_WEBSEARCH_MAX_RESULTS = 8;

export const DEFAULT_EXEC_TIMEOUT = 60;

export const DEFAULT_SESSION_GRAPH = {
	auto_merge_on_switch: true,
	persist_to_disk: true,
	max_switch_history: 20,
	model_context_window: 200000,
	router_model: "",
	router_cache_ttl_ms: 600000,
	router_cache_max_entries: 256,
	router_max_source_messages: 3,
	router_max_target_messages: 2,
	router_snippet_chars: 180,
	sticky_merge_switches: 3,
	sticky_merge_ttl_ms: 1800000,
	sticky_merge_confidence: 0.75,
};

export function getDefaultAgentsConfig() {
	return {
		workspace: DEFAULT_WORKSPACE,
		model: DEFAULT_MODEL,
		max_tokens: DEFAULT_MAX_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
		max_tool_iterations: DEFAULT_MAX_TOOL_ITERATIONS,
		steps: DEFAULT_STEPS,
		memory_window: DEFAULT_MEMORY_WINDOW,
	};
}

export function getDefaultEmailConfig() {
	return {
		enabled: false,
		consent_granted: false,
		imap_host: "",
		imap_port: DEFAULT_IMAP_PORT,
		imap_username: "",
		imap_password: "",
		imap_mailbox: "INBOX",
		imap_use_ssl: DEFAULT_IMAP_USE_SSL,
		smtp_host: "",
		smtp_port: DEFAULT_SMTP_PORT,
		smtp_username: "",
		smtp_password: "",
		smtp_use_tls: DEFAULT_SMTP_USE_TLS,
		smtp_use_ssl: DEFAULT_SMTP_USE_SSL,
		from_address: "",
		auto_reply_enabled: true,
		poll_interval_seconds: DEFAULT_POLL_INTERVAL,
		mark_seen: DEFAULT_MARK_SEEN,
		max_body_chars: DEFAULT_MAX_BODY_CHARS,
		subject_prefix: DEFAULT_SUBJECT_PREFIX,
		allow_from: [] as string[],
	};
}
