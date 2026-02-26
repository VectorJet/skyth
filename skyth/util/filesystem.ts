import fs from "fs/promises"

export const Filesystem = {
  async read(path: string): Promise<string> {
    return await fs.readFile(path, "utf-8")
  },
  async write(path: string, content: string): Promise<void> {
    await fs.mkdir(require("path").dirname(path), { recursive: true })
    await fs.writeFile(path, content, "utf-8")
  },
  async unlink(path: string): Promise<void> {
    await fs.unlink(path).catch(() => {})
  },
  async readdir(path: string): Promise<string[]> {
    return await fs.readdir(path)
  },
  async stat(path: string): Promise<any> {
    return await fs.stat(path)
  },
  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path)
      return true
    } catch {
      return false
    }
  },
}
