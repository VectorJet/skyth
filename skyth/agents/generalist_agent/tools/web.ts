import { Tool } from "@/agents/generalist_agent/tools/base";

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
