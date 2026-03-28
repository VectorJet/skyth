import { homedir } from "node:os";
import { join } from "node:path";
import {
	SUPERUSER_HASH_FILE,
	VERIFY_ATTEMPTS_FILE,
	AUDIT_LOG_FILE,
} from "./constants";

export function homePath(): string {
	return process.env.HOME || homedir();
}

export function authRoot(overrideAuthDir?: string): string {
	return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

export function getAuditLogPath(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), "superuser", AUDIT_LOG_FILE);
}

export function getVerifyAttemptsPath(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), "superuser", VERIFY_ATTEMPTS_FILE);
}

export function superuserHashesDir(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), "superuser", "hashes");
}

export function superuserHashesPath(overrideAuthDir?: string): string {
	return join(superuserHashesDir(overrideAuthDir), SUPERUSER_HASH_FILE);
}