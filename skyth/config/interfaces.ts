export interface ProviderConfig {
	api_key: string;
	api_base?: string;
	extra_headers?: Record<string, string>;
}

export interface MCPServerConfig {
	command: string;
	args: string[];
	env: Record<string, string>;
	url: string;
	headers: Record<string, string>;
	tool_timeout: number;
}

export interface WebSearchProviderConfig {
	api_key?: string;
	api_base?: string;
	model?: string;
	extra_headers?: Record<string, string>;
}

export interface EmailConfig {
	enabled: boolean;
	consent_granted: boolean;
	imap_host: string;
	imap_port: number;
	imap_username: string;
	imap_password: string;
	imap_mailbox: string;
	imap_use_ssl: boolean;
	smtp_host: string;
	smtp_port: number;
	smtp_username: string;
	smtp_password: string;
	smtp_use_tls: boolean;
	smtp_use_ssl: boolean;
	from_address: string;
	auto_reply_enabled: boolean;
	poll_interval_seconds: number;
	mark_seen: boolean;
	max_body_chars: number;
	subject_prefix: string;
	allow_from: string[];
}

export interface BasicTokenChannel {
	enabled: boolean;
	allow_from: string[];
}
