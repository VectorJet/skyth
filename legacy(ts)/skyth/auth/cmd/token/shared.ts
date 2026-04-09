import type {
	DeviceNode,
	PendingPairingCode,
	DeviceIdentityToken,
	DeviceNodesStore,
	PairingCodesStore,
} from "./types";

// Re-export from paths
export {
	authRoot,
	deviceRoot,
	identityDir,
	tokenPath,
	nodesPath,
	hasDeviceToken,
	ensureDevicePaths,
} from "./paths";

// Re-export from crypto-utils
export {
	generateToken,
	generateTokenId,
	generateNodeId,
	generateNodeToken,
	digestNodeToken,
	secureCompare,
	matchesNodeToken,
} from "./crypto-utils";

// Re-export from token-management
export {
	getDeviceTokenInfo,
	createDeviceToken,
	decryptDeviceToken,
	changeDeviceToken,
	rotateDeviceToken,
} from "./token-management";

// Re-export from nodes-store
export {
	listNodes,
	removeNode,
	verifyNodeToken,
	getNodeByToken,
	isNodeTrusted,
	getNodeForSender,
	addNodeToStore,
} from "./nodes-store";

// AddNode function - uses imported functions
import {
	generateNodeId,
	generateNodeToken,
	digestNodeToken,
} from "./crypto-utils";
import { addNodeToStore } from "./nodes-store";

export function addNode(
	channel: string,
	senderId: string,
	metadata: Record<string, unknown> = {},
	overrideAuthDir?: string,
	providedToken?: string,
): DeviceNode {
	const now = new Date().toISOString();
	const rawToken = providedToken || generateNodeToken();
	const node: DeviceNode = {
		id: generateNodeId(),
		channel,
		sender_id: senderId,
		token: digestNodeToken(rawToken),
		mfa_verified: true,
		mfa_verified_at: now,
		trusted_at: now,
		metadata,
	};

	return addNodeToStore(node, overrideAuthDir);
}
