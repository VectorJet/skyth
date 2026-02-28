import { registry, type ConfigureRegistry } from "@/cli/cmd/configure/registry";
import "./username";
import "./password";
import "./provider";
import "./model";
import "./channel";
import "./websearch";

export function getConfigureRegistry(): ConfigureRegistry {
  return registry;
}

export function registerConfigureTopics(): void {
}

export function getTopicUsage(): string {
  const topics = registry.list();
  const lines = topics.map((t) => `  ${t.manifest.id.padEnd(12)} ${t.manifest.description}`);
  return ["Topics:", ...lines].join("\n");
}
