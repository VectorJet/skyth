import { join } from "node:path";
import { existsSync } from "node:fs";

export function pythonModuleAvailable(moduleName: string): boolean {
	const python = existsSync(
		join(process.cwd(), "legacy", ".venv", "bin", "python"),
	)
		? join(process.cwd(), "legacy", ".venv", "bin", "python")
		: "python3";
	const proc = Bun.spawnSync({
		cmd: [python, "-c", `import ${moduleName}`],
		stdout: "ignore",
		stderr: "ignore",
	});
	return proc.exitCode === 0;
}

export function pythonCommand(): string {
	return existsSync(join(process.cwd(), "legacy", ".venv", "bin", "python"))
		? join(process.cwd(), "legacy", ".venv", "bin", "python")
		: "python3";
}
