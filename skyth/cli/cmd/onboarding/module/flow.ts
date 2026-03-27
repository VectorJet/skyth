import type { Config } from "@/cli/cmd/onboarding/../../../config/schema";
import type {
	InteractiveFlowResult,
	OnboardingArgs,
	OnboardingDeps,
} from "@/cli/cmd/onboarding/module/types";
import {
	discoverSteps,
	shouldSkipStep,
	type StepContext,
	type StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";
import {
	intro as clackIntro,
	outro as clackOutro,
	note as clackNote,
} from "@clack/prompts";
import {
	readAsciiArt,
	defaultWrite,
	printHeader,
	printSection,
} from "@/cli/cmd/onboarding/module/ui";

export async function runInteractiveFlow(
	cfg: Config,
	args: OnboardingArgs,
	deps: OnboardingDeps,
): Promise<InteractiveFlowResult> {
	const useClack = Boolean(process.stdin.isTTY && process.stdout.isTTY);

	if (useClack) {
		return await runClackFlow(cfg, args, deps);
	}
	return await runPlainFlow(cfg, args, deps);
}

async function runClackFlow(
	cfg: Config,
	args: OnboardingArgs,
	deps: OnboardingDeps,
): Promise<InteractiveFlowResult> {
	const steps = await discoverSteps();

	const ctx: StepContext = {
		cfg,
		args,
		deps,
		mode: "quickstart",
		configMode: deps.existingConfigDetected ? "keep" : "update",
		updates: {},
		notices: [],
		patches: [],
		stepResults: new Map(),
	};

	const finalUpdates: Record<string, any> = {};
	const finalNotices: string[] = [];
	const finalPatches: any[] = [];
	let installDaemon = false;
	let cancelled = false;
	let finalMode: "quickstart" | "manual" = "quickstart";

	for (const step of steps) {
		if (shouldSkipStep(step, ctx)) {
			continue;
		}

		try {
			const result = await step.handler(ctx);

			ctx.stepResults.set(step.manifest.id, result);

			if (result.cancelled) {
				cancelled = true;
				break;
			}

			if (result.updates) {
				Object.assign(finalUpdates, result.updates);
			}
			if (result.notices) {
				finalNotices.push(...result.notices);
			}
			if (result.patches) {
				finalPatches.push(...result.patches);
			}
			if (
				"installDaemon" in result &&
				typeof result.installDaemon === "boolean"
			) {
				installDaemon = result.installDaemon;
			}
			if (result.updates?._mode) {
				finalMode = result.updates._mode;
			}
		} catch (error) {
			console.error(`Step ${step.manifest.id} failed:`, error);
			finalNotices.push(
				`Step ${step.manifest.name} failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	if (cancelled) {
		return {
			cancelled: true,
			mode: finalMode,
			updates: {},
			installDaemon: false,
			channelPatches: [],
			notices: [],
		};
	}

	return {
		cancelled: false,
		mode: finalMode,
		updates: finalUpdates,
		installDaemon,
		channelPatches: finalPatches,
		notices: finalNotices,
	};
}

async function runPlainFlow(
	cfg: Config,
	args: OnboardingArgs,
	deps: OnboardingDeps,
): Promise<InteractiveFlowResult> {
	const steps = await discoverSteps();
	const write = deps.write ?? defaultWrite;
	printHeader(write);

	const ctx: StepContext = {
		cfg,
		args,
		deps,
		mode: "quickstart",
		configMode: deps.existingConfigDetected ? "keep" : "update",
		updates: {},
		notices: [],
		patches: [],
		stepResults: new Map(),
	};

	const finalUpdates: Record<string, any> = {};
	const finalNotices: string[] = [];
	const finalPatches: any[] = [];
	let installDaemon = false;
	let cancelled = false;
	let finalMode: "quickstart" | "manual" = "quickstart";

	for (const step of steps) {
		if (shouldSkipStep(step, ctx)) {
			continue;
		}

		try {
			const result = await step.handler(ctx);

			ctx.stepResults.set(step.manifest.id, result);

			if (result.cancelled) {
				cancelled = true;
				break;
			}

			if (result.updates) {
				Object.assign(finalUpdates, result.updates);
			}
			if (result.notices) {
				finalNotices.push(...result.notices);
			}
			if (result.patches) {
				finalPatches.push(...result.patches);
			}
			if (
				"installDaemon" in result &&
				typeof result.installDaemon === "boolean"
			) {
				installDaemon = result.installDaemon;
			}
			if (result.updates?._mode) {
				finalMode = result.updates._mode;
			}
		} catch (error) {
			console.error(`Step ${step.manifest.id} failed:`, error);
			finalNotices.push(
				`Step ${step.manifest.name} failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	if (cancelled) {
		return {
			cancelled: true,
			mode: finalMode,
			updates: {},
			installDaemon: false,
			channelPatches: [],
			notices: [],
		};
	}

	return {
		cancelled: false,
		mode: finalMode,
		updates: finalUpdates,
		installDaemon,
		channelPatches: finalPatches,
		notices: finalNotices,
	};
}
