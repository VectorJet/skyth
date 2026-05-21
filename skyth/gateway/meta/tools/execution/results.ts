function isGatewayMultimodalResult(
	value: any,
): value is { content: any[]; path?: string; mimeType?: string } {
	return Boolean(
		value &&
			typeof value === "object" &&
			value.__gateway_multimodal__ === true &&
			Array.isArray(value.content),
	);
}

function isMcpContentResult(
	value: any,
): value is { content: any[]; isError?: boolean } {
	return Boolean(
		value && typeof value === "object" && Array.isArray(value.content),
	);
}

function mcpTextContent(content: any[]): string | undefined {
	const text = content
		.filter(
			(item: any) => item?.type === "text" && typeof item.text === "string",
		)
		.map((item: any) => item.text)
		.join("\n");
	return text || undefined;
}

function isMcpNativeResult(value: any): value is { content: any[] } {
	return Boolean(
		value &&
			typeof value === "object" &&
			Array.isArray(value.content) &&
			value.content.some(
				(item: any) =>
					item && (item.type === "image" || item.type === "resource"),
			),
	);
}

export function formatCompletedToolResult(
	toolName: string,
	output: any,
	duration?: number,
): Record<string, unknown> {
	if (isGatewayMultimodalResult(output)) {
		return {
			content: output.content,
			structuredContent: {
				tool: toolName,
				async: false,
				path: output.path,
				mimeType: output.mimeType,
				executionTime: duration,
			},
		};
	}

	if (isMcpNativeResult(output)) {
		const textBlocks = output.content.filter(
			(item: any) => item.type === "text",
		);
		const mediaBlocks = output.content.filter(
			(item: any) => item.type !== "text",
		);
		const metaText = JSON.stringify(
			{ tool: toolName, async: false, executionTime: duration },
			null,
			2,
		);

		return {
			content: [
				{ type: "text", text: metaText },
				...textBlocks,
				...mediaBlocks,
			],
			structuredContent: {
				tool: toolName,
				async: false,
				executionTime: duration,
			},
		};
	}

	if (isMcpContentResult(output)) {
		const { content, ...rest } = output;
		return {
			content,
			structuredContent: {
				tool: toolName,
				async: false,
				executionTime: duration,
				...rest,
				text: mcpTextContent(content),
			},
		};
	}

	return output ?? {};
}
