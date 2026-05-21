export const TAB_PROFILES: Record<string, { mcpServers: string[] }> = {
	chat: {
		mcpServers: ["context7", "chrome-devtools"],
	},
	code: {
		mcpServers: ["context7"],
	},
	cowork: {
		mcpServers: ["chrome-devtools", "context7"],
	},
};

export class TabManager {
	private activeTab = "chat";

	getActiveTab(): string {
		return this.activeTab;
	}

	setActiveTab(tabName: string): boolean {
		if (TAB_PROFILES[tabName]) {
			this.activeTab = tabName;
			return true;
		}
		return false;
	}

	getTabProfile(tabName: string) {
		return TAB_PROFILES[tabName];
	}

	getAllProfiles() {
		return TAB_PROFILES;
	}
}
