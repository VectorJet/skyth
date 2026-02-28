export interface WriteScope {
  kind: "write";
  description: "Read and write access to Skyth";
}

export const WRITE_SCOPE: WriteScope = {
  kind: "write",
  description: "Read and write access to Skyth",
};

export function hasWriteScope(scopes: string[]): boolean {
  return scopes.includes("write") || scopes.includes("admin");
}
