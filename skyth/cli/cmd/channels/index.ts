export { channelsEditCommand } from "@/cli/cmd/channels/edit";
export type { ChannelsEditArgs, ChannelsEditDeps } from "@/cli/cmd/channels/types";
export { isChannelPreviouslyConfigured, requireSuperuserForConfiguredChannel } from "@/cli/cmd/channels/auth_gate";
export type { AuthGateDeps } from "@/cli/cmd/channels/auth_gate";
