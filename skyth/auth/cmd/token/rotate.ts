import { promptInput } from "@/cli/runtime_helpers";
import {
  rotateDeviceToken,
  hasDeviceToken,
  decryptDeviceToken,
  getDeviceTokenInfo,
} from "./shared";

export async function rotateTokenCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  if (!hasDeviceToken()) {
    console.error("Error: No device token exists.");
    console.log("Create one with: skyth auth token create");
    return 1;
  }

  const password = await promptInput("Enter superuser password to rotate token: ");
  if (!password) {
    console.error("Error: Password is required.");
    return 1;
  }

  const valid = await decryptDeviceToken(password);
  if (!valid) {
    console.error("Error: Incorrect password.");
    return 1;
  }

  try {
    const oldTokenInfo = getDeviceTokenInfo();
    
    const { path, token } = await rotateDeviceToken(password);
    
    console.log("");
    console.log("Device identity token rotated successfully!");
    console.log(`Old Token ID: ${oldTokenInfo?.token_id || 'unknown'}`);
    console.log(`New Token ID: ${token.token_id}`);
    console.log(`Rotated at: ${token.created_at}`);
    console.log("");
    console.log("IMPORTANT: Any external systems using the old token will need to be updated.");

    return 0;
  } catch (error) {
    console.error(`Error rotating token: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
