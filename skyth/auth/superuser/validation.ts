import { COMMON_PASSWORDS } from "./constants";

export function validatePasswordStrength(password: string): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];
	const trimmed = password.trim();

	if (trimmed.length < 12) {
		errors.push("Password must be at least 12 characters long.");
	}
	if (!/[A-Z]/.test(trimmed)) {
		errors.push("Password must contain at least one uppercase letter.");
	}
	if (!/[a-z]/.test(trimmed)) {
		errors.push("Password must contain at least one lowercase letter.");
	}
	if (!/[0-9]/.test(trimmed)) {
		errors.push("Password must contain at least one number.");
	}
	if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
		errors.push("Password must contain at least one special character.");
	}
	if (COMMON_PASSWORDS.includes(trimmed.toLowerCase())) {
		errors.push("Password is too common. Choose a stronger password.");
	}

	return { valid: errors.length === 0, errors };
}