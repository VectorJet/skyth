export const DEFAULT_EXEC_TOOL_DENY = [
	"rm -rf /*",
	"rm -rf /",
	"mkfs",
	"dd if=/dev/zero",
	"mv /* /dev/null",
	":(){:|:&};:",
];

export const DEFAULT_HTTP_TOOL_DENY: string[] = [
	"localhost",
	"127.0.0.1",
	"0.0.0.0",
	"::1",
	".local",
	".intranet",
];

export const DEFAULT_GATEWAY_HTTP_TOOL_DENY = [...DEFAULT_HTTP_TOOL_DENY];

export const DANGEROUS_TOOL_PATTERNS = [
	/\brm\s+-[rf]{1,2}\b/i,
	/\bdel\s+\/[fq]\b/i,
	/\brmdir\s+\/s\b/i,
	/\bdd\s+if=/i,
	/\b(shutdown|reboot|poweroff)\b/i,
	/:\(\)\s*\{.*\};\s*:/i,
	/\bcurl.*\|\s*sh\b/i,
	/\bwget.*\|\s*sh\b/i,
	/\bsudo\s+rm\b/i,
	/\bformat\s+[a-z]:/i,
	/\bnewfs\b/i,
	/\bmkfs\b/i,
];

export function isDangerousCommand(command: string): boolean {
	for (const pattern of DANGEROUS_TOOL_PATTERNS) {
		if (pattern.test(command)) return true;
	}
	return false;
}

export const OWNER_ONLY_TOOLS = new Set([
	"whatsapp_login",
	"cron",
	"gateway",
	"nodes",
	"save_key",
	"create_key",
	"revoke_key",
	"auth",
	"gate",
]);

export function isOwnerOnlyTool(toolName: string): boolean {
	return OWNER_ONLY_TOOLS.has(toolName.toLowerCase());
}
