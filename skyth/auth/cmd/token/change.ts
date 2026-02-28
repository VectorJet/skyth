import { promptInput } from "@/cli/runtime_helpers";
import {
  changeDeviceToken,
  hasDeviceToken,
  decryptDeviceToken,
} from "./shared";

export async function changeTokenCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  if (!hasDeviceToken()) {
    console.error("Error: No device token exists.");
    console.log("Create one with: skyth auth token create");
    return 1;
  }

  const currentPassword = await promptInput("Enter current superuser password: ");
  if (!currentPassword) {
    console.error("Error: Current password is required.");
    return 1;
  }

  const valid = await decryptDeviceToken(currentPassword);
  if (!valid) {
    console.error("Error: Incorrect password.");
    return 1;
  }

  const newPassword = await promptInput("Enter new superuser password: ");
  if (!newPassword) {
    console.error("Error: New password is required.");
    return 1;
  }

  const confirmPassword = await promptInput("Confirm new superuser password: ");
  if (newPassword !== confirmPassword) {
    console.error("Error: Passwords do not match.");
    return 1;
  }

  try {
    const { path, token } = await changeDeviceToken(newPassword);
    
    console.log("");
    console.log("Device identity token changed successfully!");
    console.log(`New Token ID: ${token.token_id}`);
    console.log(`Changed at: ${token.created_at}`);

    return 0;
  } catch (error) {
    console.error(`Error changing token: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
