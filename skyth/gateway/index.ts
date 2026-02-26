export { startGatewayServer, type GatewayServer, type GatewayServerOpts } from "@/gateway/server";
export { startBonjourAdvertiser, type BonjourAdvertiser, type BonjourAdvertiseOpts } from "@/gateway/discovery";
export { discoverGateways, formatDiscoveryTable, type DiscoveredGateway } from "@/gateway/discover";
export { attachWsConnectionHandler } from "@/gateway/ws-connection";
export type { GatewayClient, GatewayFrame, GatewayRequestFrame, GatewayResponseFrame, GatewayEventFrame } from "@/gateway/protocol";
export { HANDSHAKE_TIMEOUT_MS, MAX_PAYLOAD_BYTES } from "@/gateway/protocol";
