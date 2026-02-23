import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

interface SkillEntry {
  name: string;
  path: string;
  source: "workspace" | "builtin";
}

interface SkillMeta {
  [key: string]: string;
}

function parseFrontmatter(content: string): SkillMeta {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end < 0) return {};
  const block = content.slice(4, end);
  const out: SkillMeta = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
    out[key] = value;
  }
  return out;
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end < 0) return content;
  return content.slice(end + 4).trimStart();
}

function checkBin(bin: string): boolean {
  const proc = Bun.spawnSync({ cmd: ["sh", "-lc", `command -v ${bin}`], stdout: "ignore", stderr: "ignore" });
  return proc.exitCode === 0;
}

export class SkillsLoader {
  private readonly workspaceSkills: string;
  private readonly builtinSkills: string;

  constructor(workspace: string, builtinSkillsDir?: string) {
    this.workspaceSkills = join(workspace, "skills");
    this.builtinSkills = builtinSkillsDir ?? resolve(process.cwd(), "skyth", "skills");
  }

  listSkills(filterUnavailable = true): SkillEntry[] {
    const out: SkillEntry[] = [];

    if (existsSync(this.workspaceSkills)) {
      for (const name of readdirSync(this.workspaceSkills)) {
        const path = join(this.workspaceSkills, name, "SKILL.md");
        if (existsSync(path)) out.push({ name, path, source: "workspace" });
      }
    }

    if (existsSync(this.builtinSkills)) {
      for (const name of readdirSync(this.builtinSkills)) {
        const path = join(this.builtinSkills, name, "SKILL.md");
        if (!existsSync(path)) continue;
        if (out.some((item) => item.name === name)) continue;
        out.push({ name, path, source: "builtin" });
      }
    }

    const sorted = out.sort((a, b) => a.name.localeCompare(b.name));
    return filterUnavailable ? sorted.filter((item) => this.checkRequirements(this.getSkillMeta(item.name))) : sorted;
  }

  loadSkill(name: string): string | undefined {
    const workspacePath = join(this.workspaceSkills, name, "SKILL.md");
    if (existsSync(workspacePath)) return readFileSync(workspacePath, "utf-8");
    const builtinPath = join(this.builtinSkills, name, "SKILL.md");
    if (existsSync(builtinPath)) return readFileSync(builtinPath, "utf-8");
    return undefined;
  }

  loadSkillsForContext(skillNames: string[]): string {
    const parts: string[] = [];
    for (const name of skillNames) {
      const raw = this.loadSkill(name);
      if (!raw) continue;
      parts.push(`### Skill: ${name}\n\n${stripFrontmatter(raw)}`);
    }
    return parts.join("\n\n---\n\n");
  }

  buildSkillsSummary(): string {
    const skills = this.listSkills(false);
    if (!skills.length) return "";
    const lines: string[] = ["<skills>"];
    for (const skill of skills) {
      const desc = this.getSkillDescription(skill.name);
      const meta = this.getSkillMeta(skill.name);
      const available = this.checkRequirements(meta);
      lines.push(`  <skill available=\"${String(available)}\">`);
      lines.push(`    <name>${this.escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${this.escapeXml(desc)}</description>`);
      lines.push(`    <location>${this.escapeXml(skill.path)}</location>`);
      const missing = this.getMissingRequirements(meta);
      if (!available && missing) {
        lines.push(`    <requires>${this.escapeXml(missing)}</requires>`);
      }
      lines.push("  </skill>");
    }
    lines.push("</skills>");
    return lines.join("\n");
  }

  getAlwaysSkills(): string[] {
    const out: string[] = [];
    for (const skill of this.listSkills(true)) {
      const meta = this.getSkillMetadata(skill.name);
      const jsonMeta = this.parseSkillJsonMeta(meta.metadata ?? "");
      if ((jsonMeta.always ?? false) || (meta.always ?? "").toLowerCase() === "true") {
        out.push(skill.name);
      }
    }
    return out;
  }

  getSkillMetadata(name: string): SkillMeta {
    const content = this.loadSkill(name);
    if (!content) return {};
    return parseFrontmatter(content);
  }

  private getSkillDescription(name: string): string {
    const meta = this.getSkillMetadata(name);
    return meta.description || name;
  }

  private parseSkillJsonMeta(raw: string): Record<string, any> {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      const d = data as Record<string, any>;
      return (d.skyth && typeof d.skyth === "object") ? d.skyth : (d.openclaw && typeof d.openclaw === "object" ? d.openclaw : {});
    } catch {
      return {};
    }
  }

  private getSkillMeta(name: string): Record<string, any> {
    const meta = this.getSkillMetadata(name);
    return this.parseSkillJsonMeta(meta.metadata ?? "");
  }

  private checkRequirements(skillMeta: Record<string, any>): boolean {
    const requires = skillMeta.requires && typeof skillMeta.requires === "object" ? skillMeta.requires : {};
    const bins = Array.isArray((requires as any).bins) ? (requires as any).bins : [];
    const envs = Array.isArray((requires as any).env) ? (requires as any).env : [];
    for (const bin of bins) {
      if (!checkBin(String(bin))) return false;
    }
    for (const env of envs) {
      if (!process.env[String(env)]) return false;
    }
    return true;
  }

  private getMissingRequirements(skillMeta: Record<string, any>): string {
    const missing: string[] = [];
    const requires = skillMeta.requires && typeof skillMeta.requires === "object" ? skillMeta.requires : {};
    const bins = Array.isArray((requires as any).bins) ? (requires as any).bins : [];
    const envs = Array.isArray((requires as any).env) ? (requires as any).env : [];
    for (const bin of bins) {
      const value = String(bin);
      if (!checkBin(value)) missing.push(`CLI: ${value}`);
    }
    for (const env of envs) {
      const value = String(env);
      if (!process.env[value]) missing.push(`ENV: ${value}`);
    }
    return missing.join(", ");
  }

  private escapeXml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
}
