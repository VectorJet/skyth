export const DEFAULT_SAFE_BINS = [
  "git",
  "node",
  "npm",
  "pnpm",
  "bun",
  "yarn",
  "rg",
  "fd",
  "ls",
  "cat",
  "echo",
  "pwd",
  "mkdir",
  "touch",
  "cp",
  "mv",
  "rm",
  "chmod",
  "chown",
  "find",
  "grep",
  "awk",
  "sed",
  "sort",
  "uniq",
  "head",
  "tail",
  "wc",
  "curl",
  "wget",
];

export const DEFAULT_DENY_BINS = [
  "sudo",
  "su",
  "passwd",
  "mkfs",
  "newfs",
  "dd",
  "fdisk",
  "parted",
  "shutdown",
  "reboot",
  "poweroff",
  "init",
  "systemctl",
  "launchctl",
  "rmmod",
  "modprobe",
  "iptables",
  "ufw",
  "firewall-cmd",
];

export const DANGEROUS_SHELL_PATTERNS = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/i,
  /\bcurl.*\|\s*sh\b/i,
  /\bwget.*\|\s*sh\b/i,
  /\bsudo\s+rm\b/i,
  /\bformat\s+[a-z]:/i,
  /\bnewfs\b/i,
  /\bmkfs\b/i,
  /\b>\s*\/dev\/sd[a-z]\b/i,
  /\b>\s*\/dev\/null\b.*>/i,
  /\bchmod\s+777\b/i,
  /\bchmod\s+-R\s+777\b/i,
];

export function isSafeBin(binName: string, safeList: string[], denyList: string[]): boolean {
  const normalized = binName.toLowerCase().trim();
  
  if (denyList.includes(normalized)) return false;
  
  if (safeList.length > 0) {
    return safeList.includes(normalized);
  }
  
  return true;
}

export function extractBinFromCommand(command: string): string | null {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return null;
  
  const firstPart = parts[0];
  if (!firstPart) return null;
  
  let binPart: string = firstPart;
  
  if (binPart.startsWith("./")) {
    binPart = binPart.slice(2);
  }
  
  if (binPart.startsWith("/")) {
    const split = binPart.split("/");
    const last = split[split.length - 1];
    binPart = last !== undefined ? last : binPart;
  } else if (binPart.includes("/")) {
    const split = binPart.split("/");
    const last = split[split.length - 1];
    binPart = last !== undefined ? last : binPart;
  }
  
  return binPart && binPart.length > 0 ? binPart : null;
}

export function checkCommandSafety(
  command: string,
  safeList: string[],
  denyList: string[],
): { safe: boolean; reason?: string } {
  const bin = extractBinFromCommand(command);
  if (!bin) {
    return { safe: false, reason: "Cannot parse command" };
  }
  
  if (!isSafeBin(bin, safeList, denyList)) {
    return { safe: false, reason: `Binary '${bin}' is denied` };
  }
  
  if (safeList.length > 0 && !isSafeBin(bin, safeList, [])) {
    return { safe: false, reason: `Binary '${bin}' is not in allowlist` };
  }
  
  for (const pattern of DANGEROUS_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: "Command contains dangerous pattern" };
    }
  }
  
  return { safe: true };
}
