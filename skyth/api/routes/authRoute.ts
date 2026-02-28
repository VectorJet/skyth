import { verifyCredentials } from "@/api/auth/verify";

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

  if (!result.valid) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    token: `skyth_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    username: result.username,
  };
}
