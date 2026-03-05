import {
  autocomplete as clackAutocomplete,
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  text as clackText,
  symbol as clackSymbol,
  symbolBar as clackSymbolBar,
  S_BAR_END as clackBarEnd,
} from "@clack/prompts";
import { PasswordPrompt, settings as clackSettings } from "@clack/core";
import pc from "picocolors";
import type { SelectOption } from "@/cli/cmd/onboarding/module/types";
const MASK_CHAR = "\u25A3";
const MAX_MASK_DISPLAY = 32;

export async function clackSelectValue<T extends string>(
  message: string,
  options: Array<SelectOption<T>>,
  initialValue: T,
): Promise<T | undefined> {
  const value = await clackSelect<T>({
    message,
    options: options.map((o) => ({ value: o.value, label: o.label })) as any,
    initialValue,
  });
  if (isCancel(value)) return undefined;
  return value as T;
}

export async function clackAutocompleteValue<T extends string>(
  message: string,
  options: Array<{ value: T; label: string; hint?: string }>,
  initialValue?: T,
): Promise<T | undefined> {
  const value = await clackAutocomplete<T>({
    message,
    maxItems: 8,
    options: options as any,
    initialValue,
    initialUserInput: "",
  });
  if (isCancel(value)) return undefined;
  return value as T;
}

export async function clackTextValue(message: string, initialValue?: string): Promise<string | undefined> {
  const value = await clackText({
    message,
    initialValue: initialValue && initialValue.length > 0 ? initialValue : undefined,
    placeholder: initialValue && initialValue.length > 0 ? initialValue : undefined,
  });
  if (isCancel(value)) return undefined;
  const raw = String(value ?? "").trim();
  return raw || (initialValue ?? "");
}

function truncatedMask(input: string): string {
  if (input.length <= MAX_MASK_DISPLAY) return MASK_CHAR.repeat(input.length);
  return MASK_CHAR.repeat(MAX_MASK_DISPLAY) + pc.dim(`... (${input.length} chars)`);
}

export async function clackSecretValue(message: string, initialValue?: string): Promise<string | undefined> {
  const withGuide = clackSettings.withGuide;
  const bar = (state: string) => clackSymbolBar(state as any);
  const sym = (state: string) => clackSymbol(state as any);
  const barEnd = clackBarEnd;

  const value = await new PasswordPrompt({
    mask: MASK_CHAR,
    render() {
      const title = `${withGuide ? `${pc.gray(bar("active"))}\n` : ""}${sym(this.state)}  ${message}\n`;
      const masked = truncatedMask(this.userInput);

      switch (this.state) {
        case "submit": {
          const prefix = withGuide ? `${pc.gray(bar("submit"))}  ` : "";
          return `${title}${prefix}${masked ? pc.dim(masked) : ""}`;
        }
        case "cancel": {
          const prefix = withGuide ? `${pc.gray(bar("cancel"))}  ` : "";
          const display = masked ? pc.strikethrough(pc.dim(masked)) : "";
          return `${title}${prefix}${display}${masked && withGuide ? `\n${pc.gray(bar("cancel"))}` : ""}`;
        }
        default: {
          const prefix = withGuide ? `${pc.cyan(bar("active"))}  ` : "";
          const end = withGuide ? pc.cyan(barEnd) : "";
          const activeDisplay = this.userInput.length <= MAX_MASK_DISPLAY
            ? this.userInputWithCursor
            : truncatedMask(this.userInput);
          return `${title}${prefix}${activeDisplay}\n${end}\n`;
        }
      }
    },
  }).prompt() as string | symbol;

  if (isCancel(value)) return undefined;
  if (!value) return initialValue;
  const raw = String(value ?? "").trim();
  return raw || (initialValue ?? "");
}

export async function clackConfirmValue(message: string, initialValue = false): Promise<boolean | undefined> {
  const value = await clackConfirm({ message, initialValue });
  if (isCancel(value)) return undefined;
  return Boolean(value);
}

export { clackCancel, clackNote, clackIntro, clackOutro, isCancel };
