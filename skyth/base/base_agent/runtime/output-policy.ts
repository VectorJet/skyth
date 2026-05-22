export function stripThink(text: string | null | undefined): string | null {
	if (!text) return null;
	return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
}
