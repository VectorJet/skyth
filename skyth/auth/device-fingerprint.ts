import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  arch,
  cpus,
  homedir,
  hostname,
  platform,
  release,
  totalmem,
  type as osType,
} from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { secureCompare } from "@/auth/cmd/token/shared";

const IDENTITY_BIN = "identity.bin";
const KDF_INFO = "skyth-device-identity-v1";

export interface DeviceFingerprint {
  machine_id: string;
  platform: string;
  arch: string;
  os_type: string;
  kernel: string;
  cpu_model: string;
  cpu_cores: number;
  total_memory_gb: number;
  hostname: string;
}

export interface IdentityBinary {
  version: 1;
  kind: "device_identity_binary";
  created_at: string;
  factors: {
    algorithm: "aes-256-gcm";
    iv_b64: string;
    auth_tag_b64: string;
    ciphertext_b64: string;
  };
  verification: {
    salt_b64: string;
    fingerprint_hash: string;
  };
}

function deviceDir(): string {
  return join(process.env.HOME || homedir(), ".skyth", "device");
}

function identityBinPath(): string {
  return join(deviceDir(), IDENTITY_BIN);
}

function readMachineId(): string {
  for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const id = readFileSync(p, "utf-8").trim();
      if (id) return id;
    } catch {
      // not available
    }
  }

  if (platform() === "darwin") {
    try {
      const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice", {
        encoding: "utf-8",
        timeout: 5000,
      });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    } catch {
      // not available
    }
  }

  return createHash("sha256")
    .update(`${hostname()}|${cpus()[0]?.model ?? ""}|${totalmem()}`)
    .digest("hex");
}

export function collectFingerprint(): DeviceFingerprint {
  const cpuList = cpus();
  return {
    machine_id: readMachineId(),
    platform: platform(),
    arch: arch(),
    os_type: osType(),
    kernel: release(),
    cpu_model: cpuList[0]?.model ?? "unknown",
    cpu_cores: cpuList.length,
    total_memory_gb: Math.round(totalmem() / (1024 * 1024 * 1024)),
    hostname: hostname(),
  };
}

function stableFingerprint(fp: DeviceFingerprint): string {
  return JSON.stringify({
    machine_id: fp.machine_id,
    platform: fp.platform,
    arch: fp.arch,
    cpu_model: fp.cpu_model,
    cpu_cores: fp.cpu_cores,
    total_memory_gb: fp.total_memory_gb,
  });
}

function fullFingerprint(fp: DeviceFingerprint): string {
  return JSON.stringify(fp);
}

function computeVerificationHash(fp: DeviceFingerprint, salt: Buffer): string {
  return createHash("sha256")
    .update(Buffer.concat([salt, Buffer.from(stableFingerprint(fp), "utf-8")]))
    .digest("hex");
}

export function deriveIdentityKey(deviceTokenPlaintext: string): Buffer {
  return createHmac("sha256", KDF_INFO)
    .update(deviceTokenPlaintext, "utf-8")
    .digest();
}

export function createIdentityBinary(
  deviceTokenPlaintext: string,
): { path: string; binary: IdentityBinary } {
  const dir = deviceDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best effort
  }

  const fp = collectFingerprint();
  const verificationSalt = randomBytes(32);
  const fingerprintHash = computeVerificationHash(fp, verificationSalt);

  const encKey = deriveIdentityKey(deviceTokenPlaintext);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(fullFingerprint(fp), "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const binary: IdentityBinary = {
    version: 1,
    kind: "device_identity_binary",
    created_at: new Date().toISOString(),
    factors: {
      algorithm: "aes-256-gcm",
      iv_b64: iv.toString("base64"),
      auth_tag_b64: authTag.toString("base64"),
      ciphertext_b64: ciphertext.toString("base64"),
    },
    verification: {
      salt_b64: verificationSalt.toString("base64"),
      fingerprint_hash: fingerprintHash,
    },
  };

  const path = identityBinPath();
  writeFileSync(path, JSON.stringify(binary), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best effort
  }

  return { path, binary };
}

export function hasIdentityBinary(): boolean {
  return existsSync(identityBinPath());
}

export function loadIdentityBinary(): IdentityBinary | null {
  const path = identityBinPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as IdentityBinary;
    if (parsed.kind !== "device_identity_binary") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyDeviceIdentity(): {
  valid: boolean;
  reason?: string;
} {
  const binary = loadIdentityBinary();
  if (!binary) {
    return { valid: false, reason: "no identity binary at " + identityBinPath() };
  }

  const fp = collectFingerprint();
  const salt = Buffer.from(binary.verification.salt_b64, "base64");
  const currentHash = computeVerificationHash(fp, salt);

  if (!secureCompare(binary.verification.fingerprint_hash, currentHash)) {
    return { valid: false, reason: "device fingerprint mismatch" };
  }

  return { valid: true };
}

export function decryptIdentityFactors(
  binary: IdentityBinary,
  deviceTokenPlaintext: string,
): DeviceFingerprint | null {
  try {
    const encKey = deriveIdentityKey(deviceTokenPlaintext);
    const iv = Buffer.from(binary.factors.iv_b64, "base64");
    const authTag = Buffer.from(binary.factors.auth_tag_b64, "base64");
    const ciphertext = Buffer.from(binary.factors.ciphertext_b64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf-8");

    return JSON.parse(plain) as DeviceFingerprint;
  } catch {
    return null;
  }
}
