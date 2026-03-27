import { promptPassword } from "@/cli/runtime_helpers";
import {
	hasSuperuserPasswordRecord,
	verifySuperuserPassword,
} from "@/auth/superuser";

export async function requireSuperuser(): Promise<boolean> {
	if (!hasSuperuserPasswordRecord()) {
		console.error("Error: No superuser password set.");
		console.log("Set one with: skyth configure password");
		return false;
	}

	const password = await promptPassword("Superuser password: ");
	if (!password) {
		console.error("Error: Password is required.");
		return false;
	}

	const valid = await verifySuperuserPassword(password);
	if (!valid) {
		console.error("Error: Incorrect password.");
		return false;
	}

	return true;
}
