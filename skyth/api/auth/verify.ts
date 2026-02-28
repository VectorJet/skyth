import { verifySuperuserPassword } from "@/auth/superuser";
import { loadConfig } from "@/config/loader";

export interface VerifyCredentialsResult {
  valid: boolean;
  username: string;
  error?: string;
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<VerifyCredentialsResult> {
  if (!username || !password) {
    return { valid: false, username: username || "", error: "Username and password required" };
  }

  const cfg = await loadConfig();

  if (username !== cfg.username) {
    return { valid: false, username, error: "Invalid username" };
  }

  const isValid = await verifySuperuserPassword(password);

  if (!isValid) {
    return { valid: false, username, error: "Invalid password" };
  }

  return { valid: true, username };
}
