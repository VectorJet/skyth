import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractMarkdownField } from "@/base/base_agent/context/identity";

export type OnboardingField = "user_name" | "assistant_name";

export function onboardingMissingFields(workspace: string): OnboardingField[] {
	const bootstrapPath = join(workspace, "BOOTSTRAP.md");
	if (!existsSync(bootstrapPath)) return [];

	const identityPath = join(workspace, "IDENTITY.md");
	const userPath = join(workspace, "USER.md");
	if (!existsSync(identityPath) || !existsSync(userPath)) {
		return ["user_name", "assistant_name"];
	}

	let identityRaw = "";
	let userRaw = "";
	try {
		identityRaw = readFileSync(identityPath, "utf-8");
		userRaw = readFileSync(userPath, "utf-8");
	} catch {
		return ["user_name", "assistant_name"];
	}

	const userPreferred =
		extractMarkdownField(userRaw, "What to call them") ??
		extractMarkdownField(userRaw, "Name");
	const assistantName = extractMarkdownField(identityRaw, "Name");

	const missing: OnboardingField[] = [];
	if (!userPreferred) missing.push("user_name");
	if (!assistantName) missing.push("assistant_name");
	return missing;
}

export function replyCoversOnboardingMissing(
	content: string,
	missing: OnboardingField[],
): boolean {
	const normalized = content.toLowerCase();
	const asksAssistant =
		/\b(call me|my name|name be|what should .*name|what should you call me)\b/.test(
			normalized,
		);
	const asksUser = /\b(call you|your name|what should i call you)\b/.test(
		normalized,
	);
	for (const field of missing) {
		if (field === "assistant_name" && !asksAssistant) return false;
		if (field === "user_name" && !asksUser) return false;
	}
	return true;
}
