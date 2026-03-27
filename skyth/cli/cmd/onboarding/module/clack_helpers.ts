import {
  autocomplete as clackAutocomplete,
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  note as clackNote,
  outro as clackOutro,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import type { SelectOption } from "@/cli/cmd/onboarding/module/types";
const MASK_CHAR = "\u25A3";

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

export async function clackTextValue(
  message: string,
  initialValue?: string,
  validate?: (value: string) => string | undefined,
): Promise<string | undefined> {
  const value = await clackText({
    message,
    initialValue: initialValue && initialValue.length > 0 ? initialValue : undefined,
    placeholder: initialValue && initialValue.length > 0 ? initialValue : undefined,
    validate: validate ? (v) => validate(v ?? "") : undefined,
  });
  if (isCancel(value)) return undefined;
  const raw = String(value ?? "").trim();
  return raw || (initialValue ?? "");
}

export async function clackSecretValue(
  message: string,
  initialValue?: string,
  validate?: (value: string) => string | undefined,
): Promise<string | undefined> {
  const value = await clackPassword({
    message,
    mask: MASK_CHAR,
    validate: validate ? (v) => validate(v ?? "") : undefined,
  });

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
