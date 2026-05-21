import type { PipelineDefinition } from "@/gateway/registries/pipelines/index.ts";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TranscriptInput {
	url: string;
	model?: string;
	language?: string;
	groqApiKey?: string;
}

// Load .env file from pipeline directory
async function loadEnv(): Promise<Record<string, string>> {
	const envPath = path.join(__dirname, ".env");
	const env: Record<string, string> = {};

	try {
		const content = await fs.readFile(envPath, "utf8");
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith("#")) {
				const [key, ...valueParts] = trimmed.split("=");
				if (key && valueParts.length > 0) {
					let value = valueParts.join("=").trim();
					// Remove quotes if present
					if (
						(value.startsWith('"') && value.endsWith('"')) ||
						(value.startsWith("'") && value.endsWith("'"))
					) {
						value = value.slice(1, -1);
					}
					env[key.trim()] = value;
				}
			}
		}
	} catch (error) {
		// .env file doesn't exist or can't be read, that's okay
	}

	return env;
}

async function executeCommand(command: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const pythonPath = process.env.SYSTEM_PYTHON || "python3";
		const fullCommand = command.replace(/^python3 /, `${pythonPath} `);

		const proc = spawn("/bin/bash", ["-c", fullCommand], {
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`Command failed with code ${code}: ${stderr}`));
			} else {
				resolve(stdout);
			}
		});

		proc.on("error", (error) => {
			reject(error);
		});
	});
}

function detectPlatform(url: string): "youtube" | "instagram" | "unknown" {
	if (url.includes("youtube.com") || url.includes("youtu.be")) {
		return "youtube";
	}
	if (url.includes("instagram.com")) {
		return "instagram";
	}
	return "unknown";
}

async function transcribeYouTube(url: string, language?: string): Promise<any> {
	console.log(`[TranscriptPipeline] Fetching YouTube transcript for ${url}`);

	// Extract video ID
	let videoId = url;
	const urlMatch = url.match(
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/,
	);
	if (urlMatch) {
		videoId = urlMatch[1]!;
	}

	try {
		const command = `ytt fetch "https://youtube.com/watch?v=${videoId}" --no-copy`;
		const output = await executeCommand(command);

		return {
			success: true,
			platform: "youtube",
			videoId,
			url: `https://youtube.com/watch?v=${videoId}`,
			language: language || "default",
			transcript: output.trim(),
			method: "ytt",
		};
	} catch (error: any) {
		throw new Error(`Failed to fetch YouTube transcript: ${error.message}`);
	}
}

async function transcribeInstagram(
	url: string,
	model: string = "whisper-large-v3",
	language?: string,
	groqApiKey?: string,
): Promise<any> {
	console.log(`[TranscriptPipeline] Transcribing Instagram video ${url}`);

	const apiKey = groqApiKey || process.env.GROQ_API_KEY;
	if (!apiKey) {
		throw new Error(
			"Groq API key not provided. Set GROQ_API_KEY environment variable or pass groqApiKey parameter.",
		);
	}

	const tempDir = `/tmp/transcript_${Date.now()}`;
	const audioFile = path.join(tempDir, "audio.mp3");

	try {
		// Create temp directory
		await fs.mkdir(tempDir, { recursive: true });

		// Download audio using yt-dlp
		console.log(`[TranscriptPipeline] Downloading audio from Instagram...`);
		const downloadCmd = `yt-dlp --cookies-from-browser chromium -x --audio-format mp3 -o "${audioFile}" "${url}"`;
		await executeCommand(downloadCmd);

		// Check if file exists
		try {
			await fs.access(audioFile);
		} catch {
			throw new Error("Failed to download audio file");
		}

		// Get file size
		const stats = await fs.stat(audioFile);
		console.log(
			`[TranscriptPipeline] Audio downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
		);

		// Transcribe using Groq Whisper API
		console.log(
			`[TranscriptPipeline] Transcribing with Groq Whisper (${model})...`,
		);

		const transcribeScript = `
import requests
import json
import sys

try:
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    
    headers = {
        "Authorization": f"Bearer ${apiKey}"
    }
    
    data = {
        "model": "${model}",
        "response_format": "verbose_json"
    }
    
    ${language ? `data["language"] = "${language}"` : ""}
    
    with open("${audioFile}", "rb") as audio_file:
        files = {"file": audio_file}
        response = requests.post(url, headers=headers, data=data, files=files)
    
    if response.status_code != 200:
        print(json.dumps({"error": f"API error: {response.status_code} - {response.text}"}), file=sys.stderr)
        sys.exit(1)
    
    result = response.json()
    print(json.dumps(result))
    
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

		const transcriptOutput = await executeCommand(
			`python3 -c '${transcribeScript.replace(/'/g, "'\\''")}'`,
		);
		const transcriptData = JSON.parse(transcriptOutput);

		if (transcriptData.error) {
			throw new Error(transcriptData.error);
		}

		// Clean up temp files
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error: any) {
			console.error(
				`[TranscriptPipeline] Failed to clean up temp files: ${error.message}`,
			);
		}

		return {
			success: true,
			platform: "instagram",
			url,
			model,
			language: transcriptData.language || language || "auto",
			duration: transcriptData.duration,
			transcript: transcriptData.text,
			segments: transcriptData.segments,
			method: "groq-whisper",
		};
	} catch (error: any) {
		// Clean up on error
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch {}

		throw new Error(`Failed to transcribe Instagram video: ${error.message}`);
	}
}

export const transcriptPipeline: PipelineDefinition = {
	name: "transcript",
	description:
		"Unified transcript pipeline: extracts transcripts from YouTube (using ytt) and Instagram (using yt-dlp + Groq Whisper)",
	parameters: [
		{
			name: "url",
			description: "Video URL (YouTube or Instagram)",
			type: "string",
			required: true,
		},
		{
			name: "model",
			description:
				"Whisper model for Instagram videos (default: whisper-large-v3)",
			type: "string",
			required: false,
			enum: ["whisper-large-v3", "whisper-large-v3-turbo"],
		},
		{
			name: "language",
			description:
				"Language code for transcription (e.g., en, es, fr). Auto-detect if not specified.",
			type: "string",
			required: false,
		},
		{
			name: "groqApiKey",
			description:
				"Groq API key for Instagram videos (uses GROQ_API_KEY env var if not provided)",
			type: "string",
			required: false,
		},
	],
	handler: async (args: Record<string, any>) => {
		const {
			url,
			model = "whisper-large-v3",
			language,
			groqApiKey,
		} = args as TranscriptInput;

		console.log(`[TranscriptPipeline] Processing ${url}`);

		// Load .env file
		const envVars = await loadEnv();

		// Detect platform
		const platform = detectPlatform(url);

		if (platform === "unknown") {
			throw new Error(
				"Unsupported platform. Only YouTube and Instagram are supported.",
			);
		}

		// Route to appropriate handler
		if (platform === "youtube") {
			const result = await transcribeYouTube(url, language);
			return {
				...result,
				summary: `Successfully extracted transcript from YouTube video`,
			};
		} else {
			// Use groqApiKey from args, or from .env, or from process.env
			const apiKey =
				groqApiKey || envVars.GROQ_API_KEY || process.env.GROQ_API_KEY;
			const result = await transcribeInstagram(url, model, language, apiKey);
			return {
				...result,
				summary: `Successfully transcribed Instagram video (${result.duration?.toFixed(1)}s, ${result.segments?.length || 0} segments)`,
			};
		}
	},
	metadata: {
		category: "media",
		tags: ["transcript", "youtube", "instagram", "video", "audio", "whisper"],
		version: "1.0.0",
		author: "system",
	},
};

export default transcriptPipeline;
