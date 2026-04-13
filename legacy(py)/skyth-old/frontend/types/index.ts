// types/index.ts

export type AgentStep = {
  type: 'thought' | 'tool_call' | 'tool_result';
  content?: string;
  tool?: string;
  args?: Record<string, any>;
  result?: any;
};

export type StockDataPoint = {
  date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
};

export type StockChartData = {
  info: {
    longName: string;
    symbol: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    currency: string;
  };
  chartData: {
    [range: string]: StockDataPoint[];
  };
};

export type App = {
  name: string;
  description: string;
  icon_url: string;
  mcp_server_id: string;
  is_connected: boolean;
};

export type AppWidgetData = {
  widget: string;
  data: any;
};

export type Artifact = {
  type: 'html_content' | 'image_content' | 'stock_chart_data' | 'app_widget' | 'image' | 'file';
  content?: any;
  title?: string;
  // For user uploads
  filename?: string;
  mime_type?: string;
  base64_data?: string;
};

export type AgentCall = {
  agent: string;
  query: string;
  ui_component: string;
  app_name?: string; // Optional app name for apps_agent
};

export type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  initialContent?: string;
  agentCall?: AgentCall | null;
  agentSteps?: AgentStep[];
  artifacts?: Artifact[];
  message_group_uuid: string;
  version_info: {
    current: number;
    total: number;
    prev_id?: number | null;
    next_id?: number | null;
  };
};

export type Chat = {
  id: number;
  title: string;
};

export type UserProfile = {
  id: number;
  username: string;
  avatar_url: string | null;
  is_onboarded: boolean;
  color_scheme: 'system' | 'light' | 'dark';
  accent_color: string;
  preferred_language: string;
  email: string | null;
  enable_customisation: boolean;
  skyth_personality: 'default' | 'nerd' | 'unhinged' | 'custom';
  custom_personality: string | null;
  occupation: string | null;
  about_user: string | null;
};