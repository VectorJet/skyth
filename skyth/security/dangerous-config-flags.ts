export type DangerousConfigFlag = {
  path: string;
  value: unknown;
  severity: "warn" | "critical";
  message: string;
  remediation?: string;
};

const DANGEROUS_FLAGS: Array<{
  path: string;
  severity: "warn" | "critical";
  message: string;
  remediation?: string;
}> = [
  {
    path: "channels.whatsapp.allowFrom",
    severity: "warn",
    message: "whatsapp allowFrom is deprecated, use allow_from",
    remediation: "Use channels.whatsapp.allow_from instead",
  },
  {
    path: "channels.telegram.allowFrom",
    severity: "warn",
    message: "telegram allowFrom is deprecated, use allow_from",
    remediation: "Use channels.telegram.allow_from instead",
  },
  {
    path: "channels.discord.allowFrom",
    severity: "warn",
    message: "discord allowFrom is deprecated, use allow_from",
    remediation: "Use channels.discord.allow_from instead",
  },
  {
    path: "channels.slack.groupAllowFrom",
    severity: "warn",
    message: "slack groupAllowFrom is deprecated, use group_allow_from",
    remediation: "Use channels.slack.group_allow_from instead",
  },
  {
    path: "channels.web.enabled",
    severity: "warn",
    message: "Web channel enabled - ensure allow_from is configured",
  },
  {
    path: "gateway.discovery.enabled",
    severity: "warn",
    message: "Gateway discovery enabled - ensure network is trusted",
  },
  {
    path: "tools.exec.timeout",
    severity: "warn",
    message: "High exec timeout may increase attack surface",
    remediation: "Consider reducing tools.exec.timeout",
  },
  {
    path: "agents.defaults.max_tool_iterations",
    severity: "warn",
    message: "High max_tool_iterations may increase resource usage",
  },
  {
    path: "session_graph.auto_merge_on_switch",
    severity: "warn",
    message: "Session auto-merge enabled - ensure switch is intentional",
  },
];

export function collectEnabledInsecureOrDangerousFlags(config: Record<string, any>): DangerousConfigFlag[] {
  const findings: DangerousConfigFlag[] = [];
  
  function deepGet(obj: any, path: string): unknown {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }
  
  for (const flag of DANGEROUS_FLAGS) {
    const value = deepGet(config, flag.path);
    if (value === undefined) continue;
    
    if (flag.path === "channels.web.enabled" && value === true) {
      const webAllowFrom = deepGet(config, "channels.web.allow_from");
      if (!webAllowFrom || (Array.isArray(webAllowFrom) && webAllowFrom.length === 0)) {
        findings.push({
          path: flag.path,
          value,
          severity: "critical",
          message: "Web channel enabled with empty allow_from - security risk",
          remediation: "Set channels.web.allow_from to restrict access",
        });
      } else {
        findings.push({
          path: flag.path,
          value,
          severity: flag.severity,
          message: flag.message,
          remediation: flag.remediation,
        });
      }
      continue;
    }
    
    if (flag.path === "gateway.discovery.enabled" && value === true) {
      const gatewayPassword = deepGet(config, "gateway.password");
      if (!gatewayPassword) {
        findings.push({
          path: flag.path,
          value,
          severity: "warn",
          message: "Gateway discovery enabled without password",
          remediation: "Set gateway.password for authentication",
        });
      } else {
        findings.push({
          path: flag.path,
          value,
          severity: flag.severity,
          message: flag.message,
          remediation: flag.remediation,
        });
      }
      continue;
    }
    
    findings.push({
      path: flag.path,
      value,
      severity: flag.severity,
      message: flag.message,
      remediation: flag.remediation,
    });
  }
  
  return findings;
}
