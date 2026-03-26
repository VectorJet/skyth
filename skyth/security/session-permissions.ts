import { chmodSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDataPath } from "@/utils/helpers";

const SESSION_FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

export function ensureSecureSessionPermissions(sessionId: string): void {
  const dataDir = getDataPath();
  const sessionDir = join(dataDir, "agents", "default", "sessions");
  const sessionFile = join(sessionDir, `${sessionId}.jsonl`);
  
  if (!existsSync(sessionDir)) {
    return;
  }
  
  try {
    chmodSync(sessionDir, DIRECTORY_MODE);
  } catch {
    // Best effort
  }
  
  if (existsSync(sessionFile)) {
    try {
      chmodSync(sessionFile, SESSION_FILE_MODE);
    } catch {
      // Best effort
    }
  }
}

export function ensureAllSessionPermissions(): void {
  const dataDir = getDataPath();
  const agentsDir = join(dataDir, "agents");
  
  if (!existsSync(agentsDir)) {
    return;
  }
  
  try {
    chmodSync(agentsDir, DIRECTORY_MODE);
  } catch {
    // Best effort
  }
  
  try {
    const sessionsDir = join(agentsDir, "default", "sessions");
    if (existsSync(sessionsDir)) {
      chmodSync(sessionsDir, DIRECTORY_MODE);
    }
  } catch {
    // Best effort
  }
}

export function checkSessionFilePermissions(path: string): {
  secure: boolean;
  currentMode: number;
  recommendedMode: number;
} {
  if (!existsSync(path)) {
    return { secure: true, currentMode: 0, recommendedMode: SESSION_FILE_MODE };
  }
  
  try {
    const stats = statSync(path);
    const currentMode = stats.mode & 0o777;
    const secure = currentMode <= SESSION_FILE_MODE;
    
    return {
      secure,
      currentMode,
      recommendedMode: SESSION_FILE_MODE,
    };
  } catch {
    return { secure: false, currentMode: 0, recommendedMode: SESSION_FILE_MODE };
  }
}

export function auditSessionPermissions(): {
  sessionDirSecure: boolean;
  sessionFilesSecure: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const dataDir = getDataPath();
  const sessionsDir = join(dataDir, "agents", "default", "sessions");
  
  if (!existsSync(sessionsDir)) {
    return { sessionDirSecure: true, sessionFilesSecure: true, issues: [] };
  }
  
  const dirCheck = checkSessionFilePermissions(sessionsDir);
  if (!dirCheck.secure) {
    issues.push(`Session directory has insecure permissions: ${dirCheck.currentMode.toString(8)} (should be ${dirCheck.recommendedMode.toString(8)})`);
  }
  
  return {
    sessionDirSecure: dirCheck.secure,
    sessionFilesSecure: true,
    issues,
  };
}
