import type { LLMProvider } from "@/providers/base";
import type { SessionMessage } from "@/session/manager";
import type { SessionNamingResult } from "./types";
import { STOP_WORDS } from "./patterns";

export async function generateSessionName(
	provider: LLMProvider | undefined,
	model: string | undefined,
	messages: SessionMessage[],
): Promise<SessionNamingResult> {
	const userMessages = messages.filter((m) => m.role === "user").slice(-5);
	if (userMessages.length === 0) {
		return { name: "New Chat", confidence: 0.5 };
	}

	const firstUserMessage = userMessages[0];
	if (!firstUserMessage) {
		return { name: "New Chat", confidence: 0.5 };
	}
	const content =
		typeof firstUserMessage.content === "string"
			? firstUserMessage.content
			: JSON.stringify(firstUserMessage.content ?? "");

	const shortContent = content.trim().slice(0, 100).replace(/\s+/g, " ");

	if (!provider) {
		const simpleName = generateSimpleName(shortContent);
		return { name: simpleName, confidence: 0.6 };
	}

	try {
		const response = await provider.chat({
			messages: [
				{
					role: "system",
					content: `Generate a short session name (max 50 chars) based on the user's first message. 
Return only the name, no quotes or extra text. 
Examples: "Bug fix help", "Code review", "Explain regex", "API design"`,
				},
				{ role: "user", content: `First message: ${shortContent}` },
			],
			model,
			temperature: 0.3,
			max_tokens: 30,
		});

		const rawName = (response.content ?? "")
			.trim()
			.replace(/^["']|["']$/g, "");
		if (rawName && rawName.length > 0 && rawName.length <= 50) {
			return { name: rawName, confidence: 0.85 };
		}
	} catch {
		// Fall through to simple name generation
	}

	const simpleName = generateSimpleName(shortContent);
	return { name: simpleName, confidence: 0.6 };
}

export function generateSimpleName(content: string): string {
	const words = content.split(/\s+/).filter((w) => w.length > 2);
	if (words.length === 0) return "New Chat";

	const keyTerms = words
		.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
		.slice(0, 3);

	if (keyTerms.length === 0) return "New Chat";

	let name = keyTerms.join(" ");
	if (name.length > 50) {
		name = name.slice(0, 47) + "...";
	}
	return name;
}