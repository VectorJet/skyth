import type { Config } from "@/config/schema";
import { createSecurityAuditReport, type SecurityAuditFinding } from "./audit";
import { collectEnabledInsecureOrDangerousFlags } from "./dangerous-config-flags";
import { isDangerousCommand } from "./dangerous";
import { evaluateToolPermission, evaluateFsPermission } from "./permission";

export async function runSecurityAudit(
	config: Config,
): Promise<ReturnType<typeof createSecurityAuditReport>> {
	const findings: SecurityAuditFinding[] = [];

	const configObj = config as unknown as Record<string, any>;

	const dangerousFlags = collectEnabledInsecureOrDangerousFlags(configObj);
	for (const flag of dangerousFlags) {
		findings.push({
			checkId: `config.${flag.path.replace(/\./g, "-")}`,
			severity:
				flag.severity === "critical"
					? "critical"
					: flag.severity === "warn"
						? "warn"
						: "info",
			title: `Insecure configuration: ${flag.path}`,
			detail: flag.message,
			remediation: flag.remediation,
		});
	}

	const toolsConfig = configObj.tools;
	if (toolsConfig?.exec?.timeout && Number(toolsConfig.exec.timeout) > 300) {
		findings.push({
			checkId: "config-tools-exec-timeout-high",
			severity: "warn",
			title: "High exec timeout",
			detail: `Exec timeout is ${toolsConfig.exec.timeout}s (> 300s recommended)`,
			remediation: "Consider reducing tools.exec.timeout",
		});
	}

	if (toolsConfig?.restrict_to_workspace === false) {
		findings.push({
			checkId: "config-tools-workspace-disabled",
			severity: "warn",
			title: "Filesystem not restricted to workspace",
			detail:
				"tools.restrict_to_workspace is false - filesystem access is not limited",
			remediation:
				"Set tools.restrict_to_workspace: true to limit filesystem access",
		});
	}

	const fsPolicy = evaluateFsPermission(config);
	if (!fsPolicy.workspaceOnly) {
		findings.push({
			checkId: "policy-fs-workspace-not-enforced",
			severity: "info",
			title: "Workspace-only filesystem policy not enforced",
			detail: "Filesystem tools can access paths outside workspace",
		});
	}

	const channelConfigs = configObj.channels;
	if (channelConfigs) {
		for (const [channelName, channelCfg] of Object.entries(channelConfigs)) {
			if (!channelCfg || typeof channelCfg !== "object") continue;
			const enabled = (channelCfg as any).enabled;
			if (enabled === true) {
				const allowFrom = (channelCfg as any).allow_from;
				if (
					!allowFrom ||
					(Array.isArray(allowFrom) && allowFrom.length === 0)
				) {
					findings.push({
						checkId: `channel-${channelName}-no-allowlist`,
						severity: "critical",
						title: `Channel ${channelName} has no allowlist`,
						detail: `Channel ${channelName} is enabled without allow_from - open to anyone`,
						remediation: `Set channels.${channelName}.allow_from to restrict access`,
					});
				}
			}
		}
	}

	const agentDefaults = configObj.agents?.defaults;
	if (agentDefaults) {
		if (
			!agentDefaults.max_tool_iterations ||
			Number(agentDefaults.max_tool_iterations) > 500
		) {
			findings.push({
				checkId: "config-agent-max-iterations-high",
				severity: "warn",
				title: "High max_tool_iterations",
				detail: "High max_tool_iterations may lead to excessive API usage",
				remediation: "Consider reducing agents.defaults.max_tool_iterations",
			});
		}

		if (!agentDefaults.workspace) {
			findings.push({
				checkId: "config-agent-no-workspace",
				severity: "warn",
				title: "No agent workspace configured",
				detail: "agents.defaults.workspace is not set",
				remediation: "Set agents.defaults.workspace to a secure directory",
			});
		}
	}

	return createSecurityAuditReport(findings);
}

export function formatSecurityAuditReport(
	report: ReturnType<typeof createSecurityAuditReport>,
): string {
	const lines: string[] = [
		"Security Audit Report",
		"=====================",
		"",
		`Summary: ${report.summary.critical} critical, ${report.summary.warn} warn, ${report.summary.info} info`,
		"",
	];

	if (report.summary.critical === 0 && report.summary.warn === 0) {
		lines.push("No security issues found.");
		return lines.join("\n");
	}

	const severityOrder: Array<"critical" | "warn" | "info"> = [
		"critical",
		"warn",
		"info",
	];

	for (const severity of severityOrder) {
		const findings = report.findings.filter((f) => f.severity === severity);
		if (findings.length === 0) continue;

		const header =
			severity === "critical"
				? "CRITICAL"
				: severity === "warn"
					? "Warnings"
					: "Info";
		lines.push(`${header}:`);

		for (const f of findings) {
			lines.push(`  [${f.checkId}] ${f.title}`);
			lines.push(`    ${f.detail}`);
			if (f.remediation) {
				lines.push(`    Fix: ${f.remediation}`);
			}
		}
		lines.push("");
	}

	return lines.join("\n");
}
