export type Provider = {
	value: string;
	label: string;
	hint?: string;
	isOAuth: boolean;
};

export type Model = { value: string; label: string };

export type Metadata = {
	providers: Provider[];
	modelsByProvider: Record<string, Model[]>;
	hasSuperuser: boolean;
};

export type FormData = {
	security_acknowledged: boolean;
	username: string;
	nickname: string;
	superuser_password: string;

	primary_provider: string;
	primary_model: string;
	manual_model: string;
	api_key: string;

	channel_type: string;
	channel_token: string;
	channel_app_token: string;
	channel_bridge_url: string;
	channel_bridge_token: string;

	websearch_provider: string;
	websearch_api_key: string;

	disable_auto_merge: boolean;
	use_router: boolean;
	watcher: boolean;
	install_daemon: boolean;
};

export function createInitialFormData(): FormData {
	return {
		security_acknowledged: false,
		username: "",
		nickname: "",
		superuser_password: "",

		primary_provider: "openai",
		primary_model: "__manual_model__",
		manual_model: "",
		api_key: "",

		channel_type: "none",
		channel_token: "",
		channel_app_token: "",
		channel_bridge_url: "ws://localhost:3001",
		channel_bridge_token: "",

		websearch_provider: "none",
		websearch_api_key: "",

		disable_auto_merge: false,
		use_router: false,
		watcher: false,
		install_daemon: false,
	};
}
