function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function replaceWithTokens(
	input: string,
	regex: RegExp,
	format: (...parts: string[]) => string,
): { text: string; tokens: Map<string, string> } {
	const tokens = new Map<string, string>();
	let index = 0;
	const text = input.replace(regex, (...args) => {
		const groups = args.slice(1, -2).map((value) => String(value ?? ""));
		const token = `\u0000tok${index}\u0000`;
		index += 1;
		tokens.set(token, format(...groups));
		return token;
	});
	return { text, tokens };
}

function restoreTokens(input: string, tokens: Map<string, string>): string {
	let out = input;
	for (const [token, value] of tokens.entries()) {
		out = out.split(token).join(value);
	}
	return out;
}

function renderInlineMarkdownToHtml(input: string): string {
	const codeStage = replaceWithTokens(
		input,
		/`([^`\n]+)`/g,
		(code) => `<code>${escapeHtml(code)}</code>`,
	);
	const linkStage = replaceWithTokens(
		codeStage.text,
		/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
		(label, url) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
	);

	let out = escapeHtml(linkStage.text);
	out = out.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
	out = out.replace(/__(.+?)__/g, "<b>$1</b>");
	out = out.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
	out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");

	out = restoreTokens(out, linkStage.tokens);
	out = restoreTokens(out, codeStage.tokens);
	return out;
}

export function renderTelegramMarkdown(input: string): string {
	const lines = input.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];
	let inCodeBlock = false;
	let codeBuffer: string[] = [];
	let codeLang = "";

	const flushCodeBlock = (): void => {
		const code = codeBuffer.join("\n");
		if (!codeLang) {
			out.push(`<pre>${escapeHtml(code)}</pre>`);
		} else {
			out.push(
				`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(code)}</code></pre>`,
			);
		}
		codeBuffer = [];
		codeLang = "";
	};

	for (const line of lines) {
		const fence = line.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
		if (fence) {
			if (!inCodeBlock) {
				inCodeBlock = true;
				codeLang = String(fence[1] ?? "");
			} else {
				inCodeBlock = false;
				flushCodeBlock();
			}
			continue;
		}

		if (inCodeBlock) {
			codeBuffer.push(line);
			continue;
		}

		const heading = line.match(/^#{1,6}\s+(.*)$/);
		if (heading) {
			out.push(`<b>${renderInlineMarkdownToHtml(heading[1] ?? "")}</b>`);
			continue;
		}

		const bullet = line.match(/^\s*[-*]\s+(.*)$/);
		if (bullet) {
			out.push(`• ${renderInlineMarkdownToHtml(bullet[1] ?? "")}`);
			continue;
		}

		const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
		if (ordered) {
			out.push(
				`${ordered[1]}. ${renderInlineMarkdownToHtml(ordered[2] ?? "")}`,
			);
			continue;
		}

		if (!line.trim()) {
			out.push("");
			continue;
		}

		out.push(renderInlineMarkdownToHtml(line));
	}

	if (inCodeBlock) {
		flushCodeBlock();
	}

	return out.join("\n");
}
