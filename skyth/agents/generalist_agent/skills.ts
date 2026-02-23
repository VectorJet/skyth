import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface SkillEntry {
  name: string;
  path: string;
  source: "workspace";
}

interface SkillMeta {
  [key: string]: string;
}

export class SkillsLoader {
  private readonly workspaceSkills: string;

  constructor(workspace: string) {
    this.workspaceSkills = join(workspace, "skills");
  }

  listSkills(): SkillEntry[] {
    if (!existsSync(this.workspaceSkills)) return [];
    const out: SkillEntry[] = [];
    for (const name of readdirSync(this.workspaceSkills)) {
      const skillPath = join(this.workspaceSkills, name, "SKILL.md");
      if (existsSync(skillPath)) out.push({ name, path: skillPath, source: "workspace" });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  loadSkill(name: string): string | undefined {
    const path = join(this.workspaceSkills, name, "SKILL.md");
    if (!existsSync(path)) return undefined;
    return readFileSync(path, "utf-8");
  }

  loadSkillsForContext(skillNames: string[]): string {
    const parts: string[] = [];
    for (const name of skillNames) {
      const raw = this.loadSkill(name);
      if (!raw) continue;
      parts.push(`### Skill: ${name}\n\n${this.stripFrontmatter(raw)}`);
    }
    return parts.join("\n\n---\n\n");
  }

  buildSkillsSummary(): string {
    const skills = this.listSkills();
    if (!skills.length) return "";
    const lines: string[] = ["<skills>"];
    for (const skill of skills) {
      const desc = this.getSkillDescription(skill.name);
      lines.push("  <skill available=\"true\">");
      lines.push(`    <name>${this.escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${this.escapeXml(desc)}</description>`);
      lines.push(`    <location>${this.escapeXml(skill.path)}</location>`);
      lines.push("  </skill>");
    }
    lines.push("</skills>");
    return lines.join("\n");
  }

  getAlwaysSkills(): string[] {
    const out: string[] = [];
    for (const skill of this.listSkills()) {
      const meta = this.getSkillMetadata(skill.name);
      if ((meta.always ?? "").toLowerCase() === "true") out.push(skill.name);
    }
    return out;
  }

  getSkillMetadata(name: string): SkillMeta {
    const content = this.loadSkill(name);
    if (!content || !content.startsWith("---\n")) return {};
    const end = content.indexOf("\n---", 4);
    if (end < 0) return {};
    const block = content.slice(4, end);
    const meta: SkillMeta = {};
    for (const line of block.split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
      meta[key] = value;
    }
    return meta;
  }

  private getSkillDescription(name: string): string {
    const meta = this.getSkillMetadata(name);
    return meta.description || name;
  }

  private stripFrontmatter(content: string): string {
    if (!content.startsWith("---\n")) return content;
    const end = content.indexOf("\n---", 4);
    if (end < 0) return content;
    return content.slice(end + 4).trimStart();
  }

  private escapeXml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
}
