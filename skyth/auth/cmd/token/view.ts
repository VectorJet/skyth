import { promptPassword } from "@/cli/runtime_helpers";
import { getDeviceTokenInfo, listNodes, decryptDeviceToken } from "./shared";
import {
  hasIdentityBinary,
  loadIdentityBinary,
  decryptIdentityFactors,
  verifyDeviceIdentity,
  collectFingerprint,
} from "@/auth/device-fingerprint";
import { verifySuperuserPassword } from "@/auth/superuser";

export async function viewTokenCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  const tokenInfo = getDeviceTokenInfo();

  if (!tokenInfo) {
    console.log("No device identity token found.");
    console.log("Create one with: skyth auth token create");
    return 0;
  }

  const filter = (args[0] ?? "").trim().toLowerCase();
  const nodes = listNodes();

  if (filter === "device") {
    return await viewDevice();
  }

  if (filter) {
    const filtered = nodes.filter((n) => n.channel === filter || n.id === filter);

    if (filtered.length === 0) {
      console.error(`No trusted nodes found for: ${filter}`);
      return 1;
    }

    console.log(`Trusted Nodes: ${filter}`);
    console.log("=".repeat(40));
    for (const node of filtered) {
      console.log("");
      console.log(`  Node ID:       ${node.id}`);
      console.log(`  Channel:       ${node.channel}`);
      console.log(`  Sender ID:     ${node.sender_id}`);
      console.log(`  Node Token:    ${node.token}`);
      console.log(`  MFA Verified:  ${node.mfa_verified ? "yes" : "no"}`);
      if (node.mfa_verified_at) {
        console.log(`  MFA Verified:  ${node.mfa_verified_at}`);
      }
      console.log(`  Trusted Since: ${node.trusted_at}`);
      if (node.metadata && Object.keys(node.metadata).length > 0) {
        console.log(`  Metadata:`);
        for (const [key, value] of Object.entries(node.metadata)) {
          console.log(`    ${key}: ${value}`);
        }
      }
    }
    return 0;
  }

  console.log("Device Identity Token");
  console.log("=====================");
  console.log(`Token ID: ${tokenInfo.token_id}`);
  console.log(`Created: ${tokenInfo.created_at}`);
  console.log(`KDF: ${tokenInfo.kdf.algorithm} (m=${tokenInfo.kdf.memory_cost}, t=${tokenInfo.kdf.time_cost}, p=${tokenInfo.kdf.parallelism})`);
  console.log(`Encryption: ${tokenInfo.encryption.algorithm}`);
  console.log(`Identity Binary: ${hasIdentityBinary() ? "present" : "missing"}`);
  console.log(`Nodes registered: ${nodes.length}`);

  if (nodes.length > 0) {
    console.log("");
    console.log("Trusted Nodes:");
    for (const node of nodes) {
      const mfa = node.mfa_verified ? "[mfa]" : "[no-mfa]";
      console.log(`  - ${node.channel} (${node.id}) ${mfa} - trusted since ${node.trusted_at}`);
    }
  }

  console.log("");
  console.log("View details:");
  console.log("  skyth auth token view device            Device identity factors");
  console.log("  skyth auth token view <channel|node-id> Node details");

  return 0;
}

async function viewDevice(): Promise<number> {
  if (!hasIdentityBinary()) {
    console.error("Error: No identity binary found.");
    console.log("Create one with: skyth auth token create");
    return 1;
  }

  const password = await promptPassword("Superuser password (to decrypt device identity): ");
  if (!password) {
    console.error("Error: Password is required to view device identity.");
    return 1;
  }

  const valid = await verifySuperuserPassword(password);
  if (!valid) {
    console.error("Error: Incorrect password.");
    return 1;
  }

  const plaintext = await decryptDeviceToken(password);
  if (!plaintext) {
    console.error("Error: Failed to decrypt device token.");
    return 1;
  }

  const binary = loadIdentityBinary();
  if (!binary) {
    console.error("Error: Failed to load identity binary.");
    return 1;
  }

  const factors = decryptIdentityFactors(binary, plaintext);
  if (!factors) {
    console.error("Error: Failed to decrypt identity factors. Token may have been rotated.");
    return 1;
  }

  const verification = verifyDeviceIdentity();

  console.log("Device Identity");
  console.log("===============");
  console.log(`Created:        ${binary.created_at}`);
  console.log(`Status:         ${verification.valid ? "VALID" : "MISMATCH"}`);
  if (!verification.valid) {
    console.log(`Reason:         ${verification.reason}`);
  }
  console.log("");
  console.log("Hardware Factors");
  console.log("----------------");
  console.log(`Machine ID:     ${maskValue(factors.machine_id)}`);
  console.log(`Platform:       ${factors.platform}`);
  console.log(`Architecture:   ${factors.arch}`);
  console.log(`OS Type:        ${factors.os_type}`);
  console.log(`Kernel:         ${factors.kernel}`);
  console.log(`CPU Model:      ${factors.cpu_model}`);
  console.log(`CPU Cores:      ${factors.cpu_cores}`);
  console.log(`Total Memory:   ${factors.total_memory_gb} GB`);
  console.log(`Hostname:       ${factors.hostname}`);

  console.log("");
  console.log("Current Device");
  console.log("--------------");
  const current = collectFingerprint();
  const matches = (stored: unknown, live: unknown) => stored === live ? "  " : "!!";
  console.log(`Machine ID:     ${maskValue(current.machine_id)} ${matches(factors.machine_id, current.machine_id)}`);
  console.log(`Platform:       ${current.platform} ${matches(factors.platform, current.platform)}`);
  console.log(`Architecture:   ${current.arch} ${matches(factors.arch, current.arch)}`);
  console.log(`OS Type:        ${current.os_type} ${matches(factors.os_type, current.os_type)}`);
  console.log(`Kernel:         ${current.kernel} ${matches(factors.kernel, current.kernel)}`);
  console.log(`CPU Model:      ${current.cpu_model} ${matches(factors.cpu_model, current.cpu_model)}`);
  console.log(`CPU Cores:      ${current.cpu_cores} ${matches(factors.cpu_cores, current.cpu_cores)}`);
  console.log(`Total Memory:   ${current.total_memory_gb} GB ${matches(factors.total_memory_gb, current.total_memory_gb)}`);
  console.log(`Hostname:       ${current.hostname} ${matches(factors.hostname, current.hostname)}`);

  return 0;
}

function maskValue(value: string): string {
  if (value.length <= 8) return value;
  return value.slice(0, 4) + "..." + value.slice(-4);
}
