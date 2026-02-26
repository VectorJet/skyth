export interface ConfigureTopicManifest {
  id: string;
  aliases?: string[];
  description: string;
  requiresAuth?: boolean;
  argSchema?: Record<string, any>;
}

export interface ConfigureHandlerArgs {
  args: any;
  deps: any;
  useClack: boolean;
}

export interface ConfigureResult {
  exitCode: number;
  output: string;
}

export type ConfigureHandler = (args: ConfigureHandlerArgs) => Promise<ConfigureResult>;

export interface ConfigureTopic {
  manifest: ConfigureTopicManifest;
  handler: ConfigureHandler;
}

export interface ConfigureRegistry {
  topics: Map<string, ConfigureTopic>;
  register(topic: ConfigureTopic): void;
  get(id: string): ConfigureTopic | undefined;
  getByAlias(alias: string): ConfigureTopic | undefined;
  list(): ConfigureTopic[];
  resolve(name: string): ConfigureTopic | undefined;
}

export function createConfigureRegistry(): ConfigureRegistry {
  const topics = new Map<string, ConfigureTopic>();

  return {
    topics,

    register(topic: ConfigureTopic) {
      topics.set(topic.manifest.id, topic);
      for (const alias of topic.manifest.aliases ?? []) {
        topics.set(alias, topic);
      }
    },

    get(id: string) {
      return topics.get(id);
    },

    getByAlias(alias: string) {
      return topics.get(alias);
    },

    list() {
      return [...topics.values()];
    },

    resolve(name: string) {
      const normalized = name.toLowerCase().trim();
      return topics.get(normalized);
    },
  };
}

export const registry = createConfigureRegistry();
