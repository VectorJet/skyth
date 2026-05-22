export interface CronAddArgs {
	name: string;
	message: string;
	cron: string;
	tz?: string;
}

export interface CronDeps {
	dataDir?: string;
}
