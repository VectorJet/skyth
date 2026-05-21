import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

const MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".bmp": "image/bmp",
	".svg": "image/svg+xml",
};

function inferMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

export const loadMediaFileTool: ToolDefinition = {
	name: "load_media_file",
	description:
		"Load an image/media file into model context as structured multimodal content instead of raw base64 text.",
	parameters: [
		{
			name: "path",
			description: "Absolute path to the media file",
			type: "string",
			required: true,
		},
	],
	handler: async (args) => {
		const filePath = args.path as string;

		if (!filePath || typeof filePath !== "string") {
			throw new Error('Required parameter "path" must be a string');
		}

		const stat = await fs.stat(filePath);
		if (!stat.isFile()) {
			throw new Error(`Not a file: ${filePath}`);
		}

		const mimeType = inferMimeType(filePath);
		if (!mimeType.startsWith("image/")) {
			throw new Error(
				`Unsupported media type for native MCP image content: ${mimeType}`,
			);
		}

		const data = await fs.readFile(filePath);

		return {
			content: [
				{
					type: "image",
					mimeType,
					data: data.toString("base64"),
				},
			],
			structuredContent: {
				path: filePath,
				mimeType,
				size: stat.size,
			},
		};
	},
	metadata: {
		category: "file",
		tags: ["media", "image", "multimodal", "file"],
		version: "1.0.0",
		author: "gateway",
	},
};

export default loadMediaFileTool;
