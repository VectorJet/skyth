/**
 * @tool invalid
 * @author skyth-team
 * @version 1.0.0
 * @description invalid tool
 */
import z from "zod"
import { Tool } from "@/tools/tool"

export const InvalidTool = Tool.define("invalid", {
  description: "Do not use",
  parameters: z.object({
    tool: z.string(),
    error: z.string(),
  }),
  async execute(params) {
    return {
      title: "Invalid Tool",
      output: `The arguments provided to the tool are invalid: ${params.error}`,
      metadata: {},
    }
  },
})
