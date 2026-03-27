import os from "os";
import path from "path";

export namespace Global {
	export const Path = {
		get home() {
			return process.env.SKYTH_TEST_HOME || os.homedir();
		},
		get data() {
			return path.join(
				process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
				"skyth",
			);
		},
		get cache() {
			return path.join(
				process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
				"skyth",
			);
		},
		get config() {
			return path.join(
				process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
				"skyth",
			);
		},
		get state() {
			return path.join(
				process.env.XDG_STATE_HOME ||
					path.join(os.homedir(), ".local", "state"),
				"skyth",
			);
		},
		get bin() {
			return path.join(this.data, "bin");
		},
		get log() {
			return path.join(this.data, "log");
		},
	};
}
