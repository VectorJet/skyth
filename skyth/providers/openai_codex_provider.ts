export function stripModelPrefix(model: string): string {
  if (model.startsWith("openai-codex/") || model.startsWith("openai_codex/")) {
    return model.split("/", 2)[1] ?? model;
  }
  return model;
}
