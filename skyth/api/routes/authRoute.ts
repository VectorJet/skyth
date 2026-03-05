import { randomBytes } from "node:crypto";
import { verifyCredentials } from "@/api/auth/verify";
import { addNode } from "@/auth/cmd/token/shared";

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  username?: string;
  error?: string;
}

export async function handleAuthRequest(req: AuthRequest): Promise<AuthResponse> {
  const result = await verifyCredentials(req.username, req.password);

  if (!result.valid || !result.username) {
    return { success: false, error: result.error || "Authentication failed" };
  }

  const token = `skyth_${Date.now()}_${randomBytes(16).toString("hex")}`;
  
  // Register the web client as a trusted node using the generated token
  addNode("web", result.username, { source: "web_frontend" }, undefined, token);

  return {
    success: true,
    token,
    username: result.username,
  };
}
