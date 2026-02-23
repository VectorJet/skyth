import { Tool } from "./base";

function stripTags(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export class WebSearchTool extends Tool {
  constructor(private readonly apiKey = process.env.BRAVE_API_KEY ?? "", private readonly maxResults = 5) {
    super();
  }

  get name(): string { return "web_search"; }
  get description(): string { return "Search the web and return title/url/snippet results."; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const query = String(params.query ?? "").trim();
    const count = Math.min(Math.max(Number(params.count ?? this.maxResults), 1), 10);
    if (!query) return "Error: query is required";
    if (!this.apiKey) return "Error: BRAVE_API_KEY not configured";

    try {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
      });
      if (!response.ok) return `Error: web_search failed with status ${response.status}`;
      const json: any = await response.json().catch(() => ({}));
      const results = Array.isArray(json?.web?.results) ? json.web.results.slice(0, count) : [];
      if (!results.length) return `No results for: ${query}`;

      const lines = [`Results for: ${query}`, ""];
      for (let i = 0; i < results.length; i += 1) {
        const item = results[i];
        lines.push(`${i + 1}. ${String(item?.title ?? "")}`);
        lines.push(`   ${String(item?.url ?? "")}`);
        if (item?.description) lines.push(`   ${String(item.description)}`);
      }
      return lines.join("\n");
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export class WebFetchTool extends Tool {
  constructor(private readonly maxChars = 50000) {
    super();
  }

  get name(): string { return "web_fetch"; }
  get description(): string { return "Fetch a URL and extract text or markdown-like content."; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        url: { type: "string" },
        extractMode: { type: "string", enum: ["markdown", "text"] },
        maxChars: { type: "integer", minimum: 100 },
      },
      required: ["url"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const url = String(params.url ?? "").trim();
    const extractMode = String(params.extractMode ?? "markdown");
    const maxChars = Math.max(100, Number(params.maxChars ?? this.maxChars));

    if (!isValidHttpUrl(url)) return JSON.stringify({ error: "URL validation failed", url });

    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "skyth/1.0" },
      });
      const finalUrl = response.url;
      const contentType = String(response.headers.get("content-type") ?? "");
      const body = await response.text();

      let text = body;
      let extractor = "raw";

      if (contentType.includes("application/json")) {
        try {
          text = JSON.stringify(JSON.parse(body), null, 2);
          extractor = "json";
        } catch {
          extractor = "raw";
        }
      } else if (contentType.includes("text/html") || body.slice(0, 256).toLowerCase().includes("<html")) {
        const plain = stripTags(body);
        text = extractMode === "text" ? plain : plain;
        extractor = "html";
      }

      const truncated = text.length > maxChars;
      if (truncated) text = text.slice(0, maxChars);

      return JSON.stringify({ url, finalUrl, status: response.status, extractor, truncated, length: text.length, text });
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error), url });
    }
  }
}
