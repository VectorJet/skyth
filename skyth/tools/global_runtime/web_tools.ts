import { BaseTool } from "@/base/tool";
import { toText } from "./utils";

export class WebSearchCompatTool extends BaseTool {
	private delegate?: Awaited<ReturnType<typeof import("@/tools/websearch_tool").WebSearchTool["init"]>>;
	constructor() {
		super();
	}
	get name(): string {
		return "websearch";
	}
	get description(): string {
		return "Search the web for up-to-date information.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				query: { type: "string" },
				numResults: { type: "integer", minimum: 1, maximum: 10 },
			},
			required: ["query"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		if (!this.delegate) {
			const { WebSearchTool } = await import("@/tools/websearch_tool");
			this.delegate = await WebSearchTool.init();
		}
		const result = await this.delegate.execute(
			{ query: params.query, numResults: params.numResults },
			{
				sessionID: "",
				messageID: "",
				agent: "",
				abort: new AbortController().signal,
				messages: [],
				metadata: () => {},
				ask: async () => {},
			} as any,
		);
		return result.output;
	}
}

export class WebFetchCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/web").WebFetchTool) {
		super();
	}
	get name(): string {
		return "webfetch";
	}
	get description(): string {
		return "Fetch a URL and return extracted content.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				url: { type: "string" },
			},
			required: ["url"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		return await this.delegate.execute({
			url: params.url,
			extractMode: "text",
		});
	}
}