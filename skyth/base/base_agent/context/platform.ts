export function buildPlatformOutputSection(channel: string): string {
  const normalized = channel.trim().toLowerCase();
  if (normalized === "telegram") {
    return [
      "## Platform Output",
      "- Use lightweight markdown structures: bold, lists, inline code, short code blocks.",
      "- Avoid markdown tables and long preambles.",
    ].join("\n");
  }
  if (normalized === "discord" || normalized === "slack") {
    return [
      "## Platform Output",
      "- Markdown is supported; use structure when it improves scanability.",
      "- Keep lists compact and avoid filler.",
    ].join("\n");
  }
  if (normalized === "email") {
    return [
      "## Platform Output",
      "- Email supports longer structured responses.",
      "- Use clear sections and concise summaries first.",
    ].join("\n");
  }
  if (normalized === "cli") {
    return [
      "## Platform Output",
      "- CLI can handle full detail and technical depth.",
      "- Use code fences and explicit steps when useful.",
    ].join("\n");
  }
  return [
    "## Platform Output",
    "- Use clear, structured replies.",
  ].join("\n");
}
