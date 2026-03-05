import path from "path"
import os from "os"
import { randomBytes } from "node:crypto"

export namespace Identifier {
  export function create(prefix: string, _random: boolean, timestamp?: number): string {
    const ts = timestamp ?? Date.now()
    const random = randomBytes(4).toString("hex")
    return `${prefix}_${ts}_${random}`
  }

  export function timestamp(id: string): number {
    const parts = id.split("_")
    if (parts.length >= 2) {
      const ts = parseInt(parts[1] ?? "", 10)
      if (!isNaN(ts)) return ts
    }
    return 0
  }

  export function ascending(prefix: string): string {
    const ts = Date.now()
    const random = randomBytes(4).toString("hex")
    return `${prefix}_${ts}_${random}`
  }
}
