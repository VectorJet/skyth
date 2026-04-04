import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { DeviceNodesStore, DeviceNode } from "./types";
import { nodesPath, ensureDevicePaths } from "./paths";
import { matchesNodeToken } from "./crypto-utils";

function loadNodes(overrideAuthDir?: string): DeviceNodesStore {
	const path = nodesPath(overrideAuthDir);
	if (!existsSync(path)) {
		return { version: 1, nodes: [] };
	}
	try {
		const raw = readFileSync(path, "utf-8");
		return JSON.parse(raw) as DeviceNodesStore;
	} catch {
		return { version: 1, nodes: [] };
	}
}

function saveNodes(store: DeviceNodesStore, overrideAuthDir?: string): void {
	ensureDevicePaths(overrideAuthDir);
	const path = nodesPath(overrideAuthDir);
	writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function listNodes(overrideAuthDir?: string): DeviceNode[] {
	const store = loadNodes(overrideAuthDir);
	return store.nodes;
}

export function removeNode(nodeId: string, overrideAuthDir?: string): boolean {
	const store = loadNodes(overrideAuthDir);
	const initialLength = store.nodes.length;
	store.nodes = store.nodes.filter((n) => n.id !== nodeId);

	if (store.nodes.length < initialLength) {
		saveNodes(store, overrideAuthDir);
		return true;
	}
	return false;
}

export function verifyNodeToken(
	nodeId: string,
	token: string,
	overrideAuthDir?: string,
): boolean {
	const store = loadNodes(overrideAuthDir);
	const node = store.nodes.find((n) => n.id === nodeId);
	if (!node) return false;
	return matchesNodeToken(node.token, token);
}

export function getNodeByToken(
	token: string,
	overrideAuthDir?: string,
): DeviceNode | undefined {
	const normalized = String(token ?? "").trim();
	if (!normalized) return undefined;
	const store = loadNodes(overrideAuthDir);
	return store.nodes.find(
		(n) => n.mfa_verified === true && matchesNodeToken(n.token, normalized),
	);
}

export function isNodeTrusted(
	channel: string,
	senderId: string,
	overrideAuthDir?: string,
): boolean {
	const store = loadNodes(overrideAuthDir);
	return store.nodes.some(
		(n) =>
			n.channel === channel &&
			n.sender_id === senderId &&
			n.mfa_verified === true,
	);
}

export function getNodeForSender(
	channel: string,
	senderId: string,
	overrideAuthDir?: string,
): DeviceNode | undefined {
	const store = loadNodes(overrideAuthDir);
	return store.nodes.find(
		(n) => n.channel === channel && n.sender_id === senderId,
	);
}

export function addNodeToStore(
	node: DeviceNode,
	overrideAuthDir?: string,
): DeviceNode {
	const store = loadNodes(overrideAuthDir);

	const existingIdx = store.nodes.findIndex(
		(n) => n.channel === node.channel && n.sender_id === node.sender_id,
	);
	if (existingIdx >= 0) {
		store.nodes[existingIdx] = node;
	} else {
		store.nodes.push(node);
	}

	saveNodes(store, overrideAuthDir);

	return node;
}

export { loadNodes, saveNodes };
