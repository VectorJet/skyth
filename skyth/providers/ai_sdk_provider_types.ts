export interface AISDKProviderParams {
  api_key?: string;
  api_base?: string;
  default_model?: string;
  provider_name?: string;
}

export interface AISDKToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
