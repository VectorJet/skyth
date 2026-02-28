export interface WebUiConfig {
  enabled: boolean;
  port: number;
  path: string;
  proxyToGateway?: boolean;
}

export interface GatewayApi {
  sendMessage: (content: string, channel?: string) => Promise<{ queued: boolean }>;
  getHistory: (chatId?: string) => Promise<{ messages: unknown[] }>;
  getStatus: () => Promise<{ clients: number; inboundQueue: number; outboundQueue: number }>;
}

export interface GatewayEvents {
  onMessage: (handler: (msg: { chatId: string; content: string; senderId: string }) => void) => void;
  onStatusChange: (handler: (status: { clients: number }) => void) => void;
}
