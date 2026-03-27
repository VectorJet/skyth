import { promptInput } from "@/cli/runtime_helpers";
import {
	createDeviceToken,
	hasDeviceToken,
	decryptDeviceToken,
} from "./shared";
import {
	createIdentityBinary,
	hasIdentityBinary,
} from "@/auth/device-fingerprint";

export async function createTokenCommandHandler(
	args: string[],
	passedFlags?: Record<string, string | boolean>,
): Promise<number> {
	if (hasDeviceToken()) {
		console.error("Error: Device token already exists.");
		console.log("Use 'skyth auth token view' to see current token info.");
		console.log("Use 'skyth auth token rotate' to rotate the token.");
		return 1;
	}

	const password = await promptInput("Enter superuser password: ");
	if (!password) {
		console.error("Error: Password is required.");
		return 1;
	}

	try {
		const { path, token } = await createDeviceToken(password);

		console.log("");
		console.log("Device identity token created successfully!");
		console.log(`Token ID: ${token.token_id}`);
		console.log(`Created: ${token.created_at}`);
		console.log(`Stored at: ${path}`);

		const plaintext = await decryptDeviceToken(password);
		if (plaintext && !hasIdentityBinary()) {
			const { path: binPath } = createIdentityBinary(plaintext);
			console.log(`Identity binary: ${binPath}`);
		}

		console.log("");
		console.log("Use 'skyth auth token view' to see token info.");
		console.log("Use 'skyth auth token view device' to see device identity.");
		console.log(
			"Use 'skyth auth token add-node' to register trusted channels.",
		);

		return 0;
	} catch (error) {
		console.error(
			`Error creating token: ${error instanceof Error ? error.message : error}`,
		);
		return 1;
	}
}
