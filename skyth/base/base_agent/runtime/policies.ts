import { existsSync } from "node:fs";
import { join } from "node:path";

export function stripThink(text: string | null): string | null {
	if (!text) return null;
	return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
}

export function sanitizeOutput(text: string): {
	content: string;
	replyToCurrent: boolean;
} {
	let out = text;
	const finalMatch = out.match(/<final>([\s\S]*?)<\/final>/);
	if (finalMatch) out = finalMatch[1]!;
	const replyToCurrent = /\[\[reply_to_current\]\]/i.test(out);
	out = out.replace(/\[\[reply_to_current\]\]/gi, "");
	out = out.replace(/\[\[reply_to:[^\]]*\]\]/gi, "");
	out = out.replace(/^Tool calls?:\s*\S+\([\s\S]*?\)\s*/gm, "");
	out = out.replace(/^Tool result:\s*/gm, "");
	return { content: out.trim(), replyToCurrent };
}

export type IdentityToolUseTarget =
	| {
			force: true;
			requireUser: boolean;
			requireIdentity: boolean;
	  }
	| { force: false };

export function shouldForceIdentityToolUse(
	workspace: string,
	content: string,
): IdentityToolUseTarget {
	const bootstrapPath = join(workspace, "BOOTSTRAP.md");
	if (!existsSync(bootstrapPath)) return { force: false };

	const mentionsUser = /\b(call me|my name is|i am|i'm|im)\b/i.test(content);
	const mentionsAssistant =
		/\b(call you|you are|you're|youre|your name)\b/i.test(content);

	if (!mentionsUser && !mentionsAssistant) return { force: false };
	return {
		force: true,
		requireUser: mentionsUser,
		requireIdentity: mentionsAssistant,
	};
}

export function shouldForceTaskPriority(content: string): boolean {
	const normalized = content.trim().toLowerCase();
	if (!normalized) return false;
	const isShortGreeting =
		/^(hi|hello|hey|yo|sup|what'?s up|good morning|good afternoon|good evening)\b/.test(
			normalized,
		) && normalized.split(/\s+/).length <= 4;
	if (isShortGreeting) return false;
	return (
		/\b(update|write|edit|create|delete|remove|fix|search|look up|lookup|remember|save|store|run|execute|configure|set|copy|commit|pair|authorize|auth|allowlist|read|check|use tool)\b/i.test(
			content,
		) || /\b(call me|you are|your name|my name is|i am|i'm)\b/i.test(content)
	);
}

export function isLikelyTaskDeferral(content: string | null): boolean {
	if (!content) return false;
	return /\b(let me|get my bearings|set up properly|i(?:'m| am) going to|i(?:'ll| will)\s+(?:update|set|write|fix|run|configure|check|look)|just came online|fresh session|clean slate)\b/i.test(
		content,
	);
}

export function isIdentityFileWriteToolCall(
	name: string,
	args: Record<string, any>,
): "user.md" | "identity.md" | null {
	if (name !== "write_file" && name !== "edit_file") return null;
	const rawPath = String(args?.path ?? "")
		.trim()
		.toLowerCase();
	if (!rawPath) return null;
	if (rawPath.endsWith("/user.md") || rawPath === "user.md") return "user.md";
	if (rawPath.endsWith("/identity.md") || rawPath === "identity.md")
		return "identity.md";
	return null;
}
