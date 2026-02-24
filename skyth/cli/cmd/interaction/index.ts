import { normalizeInteractiveError } from "./session";

let PROMPT_SESSION: { promptAsync: (prompt: string) => Promise<string> } | null = null;

export function initPromptSession(factory?: () => { promptAsync: (prompt: string) => Promise<string> }): void {
  PROMPT_SESSION = (factory ? factory() : { promptAsync: async () => "" });
}

export async function readInteractiveInputAsync(prompt = "<b>You</b>: "): Promise<string> {
  if (!PROMPT_SESSION) initPromptSession();
  try {
    return await PROMPT_SESSION!.promptAsync(prompt);
  } catch (error) {
    normalizeInteractiveError(error);
  }
}
