export interface ChannelsEditArgs {
  channel: string;
  enable?: boolean;
  disable?: boolean;
  set?: string;
  json?: string;
}

export interface ChannelsEditDeps {
  channelsDir?: string;
}
