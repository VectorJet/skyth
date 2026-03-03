import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"

export const Filesystem = {
  async read(filePath: string): Promise<string> {
    return await fsp.readFile(filePath, "utf-8")
  },
  async readText(filePath: string): Promise<string> {
    return await fsp.readFile(filePath, "utf-8")
  },
  async readBytes(filePath: string): Promise<Uint8Array> {
    return await fsp.readFile(filePath)
  },
  async write(filePath: string, content: string): Promise<void> {
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, content, "utf-8")
  },
  async unlink(filePath: string): Promise<void> {
    await fsp.unlink(filePath).catch(() => {})
  },
  async readdir(dirPath: string): Promise<string[]> {
    return await fsp.readdir(dirPath)
  },
  stat(filePath: string): fs.Stats {
    return fs.statSync(filePath)
  },
  async exists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  },
  async isDir(filePath: string): Promise<boolean> {
    try {
      return this.stat(filePath).isDirectory()
    } catch {
      return false
    }
  },
  normalizePath(input: string): string {
    return path.resolve(input)
  },
  windowsPath(input: string): string {
    if (process.platform === "win32") return input
    return input.replaceAll("/", "\\")
  },
  mimeType(_path: string): string | null {
    return null
  },
}
