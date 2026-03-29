// Re-export from modularized superuser directory (use @/auth/superuser for imports)
export { validatePasswordStrength } from "./superuser/validation";
export {
	hasSuperuserPasswordRecord,
	writeSuperuserPasswordRecord,
} from "./superuser/record";
export { verifySuperuserPassword } from "./superuser/verify";
export { logAuditEvent, isRateLimited } from "./superuser/audit";
export { superuserHashesDir, superuserHashesPath } from "./superuser/paths";
export type { SuperuserPasswordRecord, VerifyAttempt } from "./superuser/types";
