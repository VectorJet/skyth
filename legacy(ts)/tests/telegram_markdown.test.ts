import { describe, expect, test } from "bun:test";
import { renderTelegramMarkdown } from "../skyth/channels/telegram";

describe("telegram markdown rendering", () => {
	test("renders basic markdown into telegram HTML", () => {
		const input = [
			"# Title",
			"",
			"**bold** and *italic* and `code`",
			"- item one",
			"1. step one",
			"[OpenAI](https://openai.com)",
		].join("\n");

		const html = renderTelegramMarkdown(input);
		expect(html).toContain("<b>Title</b>");
		expect(html).toContain("<b>bold</b>");
		expect(html).toContain("<i>italic</i>");
		expect(html).toContain("<code>code</code>");
		expect(html).toContain("• item one");
		expect(html).toContain("1. step one");
		expect(html).toContain('<a href="https://openai.com">OpenAI</a>');
	});

	test("renders fenced code blocks", () => {
		const input = ["```ts", "const x = 1 < 2;", "```"].join("\n");

		const html = renderTelegramMarkdown(input);
		expect(html).toContain(
			'<pre><code class="language-ts">const x = 1 &lt; 2;</code></pre>',
		);
	});
});
