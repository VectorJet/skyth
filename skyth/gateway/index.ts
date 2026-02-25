export { startGatewayServer, type GatewayServer, type GatewayServerOpts } from "./server";
export { startBonjourAdvertiser, type BonjourAdvertiser, type BonjourAdvertiseOpts } from "./discovery";
export { discoverGateways, formatDiscoveryTable, type DiscoveredGateway } from "./discover";
export { attachWsConnectionHandler } from "./ws-connection";
export type { GatewayClient, GatewayFrame, GatewayRequestFrame, GatewayResponseFrame, GatewayEventFrame } from "./protocol";
export { HANDSHAKE_TIMEOUT_MS, MAX_PAYLOAD_BYTES } from "./protocol";
