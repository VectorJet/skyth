import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "mode-selection",
  name: "Onboarding Mode",
  description: "Select between QuickStart or Manual onboarding modes",
  order: 20,
  group: "identity",
};

export async function runModeSelectionStep(ctx: StepContext): Promise<StepResult> {
  const { clackSelectValue, clackCancel: cancel } = await import("../clack_helpers");
  const { intro: clackIntro, note: clackNote } = await import("@clack/prompts");
  const { readAsciiArt } = await import("../ui");

  clackIntro("Skyth onboarding");
  const art = readAsciiArt();
  if (art) {
    clackNote(art, "Skyth");
  }

  const mode = await clackSelectValue<"quickstart" | "manual">(
    "Onboarding mode",
    [
      { value: "quickstart", label: "QuickStart" },
      { value: "manual", label: "Manual" },
    ],
    "quickstart",
  );

  if (!mode) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  ctx.mode = mode;
  return { cancelled: false, updates: { _mode: mode }, notices: [], patches: [] };
}
