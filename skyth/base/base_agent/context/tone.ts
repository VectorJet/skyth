export function buildToneAdaptationSection(
  history: Array<Record<string, any>>,
  currentMessage: string,
): string {
  const userSamples: string[] = [];
  for (const msg of history) {
    if (String(msg?.role ?? "") !== "user") continue;
    const content = typeof msg?.content === "string" ? msg.content : "";
    if (content.trim()) userSamples.push(content.trim());
  }
  if (currentMessage.trim()) userSamples.push(currentMessage.trim());
  const tail = userSamples.slice(-6);
  const joined = tail.join(" ").toLowerCase();
  const avgLen = tail.length
    ? Math.round(tail.reduce((sum, item) => sum + item.length, 0) / tail.length)
    : 0;
  const casualMarkers = (joined.match(/\b(yo|uhh|lol|lmao|bro|idk|wanna|gonna|tryna|nah|yep|nope)\b/g) ?? []).length;
  const terse = avgLen > 0 && avgLen < 24;
  const casual = casualMarkers >= 2;
  const energy = /[!?]{2,}| all caps | -_- | xd | haha | heh /.test(` ${joined} `);

  return [
    "## Tone Adaptation",
    "- Mirror the user's tone and vocabulary lightly while staying clear.",
    `- Current style signal: ${casual ? "casual" : "neutral"}${terse ? ", terse" : ", medium detail"}${energy ? ", expressive" : ""}.`,
    "- If user asks for depth, switch to structured detailed output.",
    "- Avoid bland corporate phrasing and repetitive filler.",
    "- Avoid empty filler like: 'No rush', 'Let me know what you'd like to do', unless the user explicitly asks for reassurance.",
    "- Keep personality consistent with SOUL.md and adapt to user energy in this thread.",
  ].join("\n");
}
