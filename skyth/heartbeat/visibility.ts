export type HeartbeatVisibilityConfig = {
  showOk: boolean;
  showAlerts: boolean;
  useIndicator: boolean;
};

export type ResolvedHeartbeatVisibility = HeartbeatVisibilityConfig;

export const DEFAULT_VISIBILITY: ResolvedHeartbeatVisibility = {
  showOk: false,
  showAlerts: true,
  useIndicator: true,
};

export type ChannelVisibilityConfig = {
  showOk?: boolean;
  showAlerts?: boolean;
  useIndicator?: boolean;
};

export function resolveHeartbeatVisibility(
  channel: string,
  channelDefaults?: ChannelVisibilityConfig,
  channelConfig?: ChannelVisibilityConfig,
  accountConfig?: ChannelVisibilityConfig,
): ResolvedHeartbeatVisibility {
  return {
    showOk: accountConfig?.showOk ?? channelConfig?.showOk ?? channelDefaults?.showOk ?? DEFAULT_VISIBILITY.showOk,
    showAlerts: accountConfig?.showAlerts ?? channelConfig?.showAlerts ?? channelDefaults?.showAlerts ?? DEFAULT_VISIBILITY.showAlerts,
    useIndicator: accountConfig?.useIndicator ?? channelConfig?.useIndicator ?? channelDefaults?.useIndicator ?? DEFAULT_VISIBILITY.useIndicator,
  };
}
