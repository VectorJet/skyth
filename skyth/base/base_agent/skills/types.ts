export interface SkillEntry {
  name: string;
  path: string;
  source: "workspace" | "builtin";
}

export interface SkillMeta {
  [key: string]: string;
}
