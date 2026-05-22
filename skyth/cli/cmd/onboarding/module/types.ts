export type OnboardingMode = "quickstart" | "manual";

export interface ChannelPatch {
	channel: string;
	values: Record<string, unknown>;
}

export interface OnboardingArgs {
	username?: string;
	superuser_password?: string;
	nickname?: string;
	primary_provider?: string;
	primary_model?: string;
	api_key?: string;
	use_secondary?: boolean;
	use_router?: boolean;
	watcher?: boolean;
	skip_mcp?: boolean;
	disable_auto_merge?: boolean;
	install_daemon?: boolean;
	no_install_daemon?: boolean;
	websearch_providers?: Record<
		string,
		{ api_key?: string; api_base?: string; model?: string }
	>;
	channel_patches?: ChannelPatch[];
}

export interface SelectOption<T extends string> {
	value: T;
	label: string;
}

export interface OnboardingDeps {
	workspacePath?: string;
	configPath?: string;
	authDir?: string;
	existingConfigDetected?: boolean;
	promptUsername?: () => Promise<string>;
	promptSecret?: (message: string, initialValue?: string) => Promise<string>;
	promptInput?: (message: string, initialValue?: string) => Promise<string>;
	promptConfirm?: (message: string, initialValue?: boolean) => Promise<boolean>;
	promptSelect?: <T extends string>(
		message: string,
		options: Array<SelectOption<T>>,
		initialValue: T,
	) => Promise<T>;
	write?: (line: string) => void;
}

export interface InteractiveFlowResult {
	cancelled: boolean;
	mode: OnboardingMode;
	updates: Partial<OnboardingArgs>;
	installDaemon: boolean;
	channelPatches?: ChannelPatch[];
	notices?: string[];
}

