import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./websearch.txt"
import { loadConfig } from "../config/loader"
import { getConfiguredProviders } from "./websearch/providers"

export const WebSearchTool = Tool.define("websearch", async () => {
  return {
    get description() {
      return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString())
    },
    parameters: z.object({
      query: z.string().describe("Websearch query"),
      numResults: z.number().optional().describe("Number of search results to return (default: 8)"),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "websearch",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          numResults: params.numResults,
        },
      })

      const config = loadConfig()
      const providers = getConfiguredProviders(config)

      if (providers.length === 0) {
        return {
          output: "No web search providers configured. Please configure a web search provider using 'skyth configure web-search' or add providers in your config file.",
          title: `Web search: ${params.query}`,
          metadata: { error: "no_provider" },
        }
      }

      const errors: string[] = []

      for (const provider of providers) {
        try {
          const result = await provider.search(params.query, {
            numResults: params.numResults || config.websearch.max_results,
          })

          return {
            output: result.output,
            title: `Web search (${provider.name}): ${params.query}`,
            metadata: { provider: provider.id },
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          errors.push(`${provider.name}: ${errorMsg}`)
        }
      }

      return {
        output: `All web search providers failed:\n${errors.join("\n")}\n\nPlease check your API keys and configuration.`,
        title: `Web search: ${params.query}`,
        metadata: { error: "all_providers_failed", details: errors },
      }
    },
  }
})
