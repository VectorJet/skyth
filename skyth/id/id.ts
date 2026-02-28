import path from "path"
import os from "os"

export namespace Identifier {
  export function create(prefix: string, _random: boolean, timestamp?: number): string {
    const ts = timestamp ?? Date.now()
    const random = Math.random().toString(36).slice(2, 10)
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
    const random = Math.random().toString(36).slice(2, 10)
    return `${prefix}_${ts}_${random}`
  }
}
