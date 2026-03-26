export type SecurityAuditSeverity = "info" | "warn" | "critical";

export type SecurityAuditFinding = {
  checkId: string;
  severity: SecurityAuditSeverity;
  title: string;
  detail: string;
  remediation?: string;
};

export type SecurityAuditSummary = {
  critical: number;
  warn: number;
  info: number;
};

export type SecurityAuditReport = {
  ts: number;
  summary: SecurityAuditSummary;
  findings: SecurityAuditFinding[];
};

export function createSecurityAuditReport(findings: SecurityAuditFinding[]): SecurityAuditReport {
  const summary: SecurityAuditSummary = { critical: 0, warn: 0, info: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }
  return {
    ts: Date.now(),
    summary,
    findings,
  };
}
