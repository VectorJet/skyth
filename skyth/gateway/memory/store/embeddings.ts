import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type {
	EmbedMemoryOptions,
	EmbedMemoryResult,
} from "@/gateway/memory/store/types.ts";
import {
	defaultEmbeddingProvider,
	embeddingProviderChain,
	localEmbeddingModelName,
	loadEnvValue,
	geminiModelName,
	normalizeVector,
	nowIso,
	providerStorageName,
	retrievalDocumentText,
	vectorToBlob,
	runLocalEmbeddingHelper,
	runModalEmbeddingHelper,
} from "@/gateway/memory/store/helpers.ts";
import type {
	ConcreteEmbeddingProvider,
	EmbeddingProvider,
	EmbeddingSearchConfig,
} from "@/gateway/memory/store/types.ts";

export async function embedMissingChunks(
	ctx: MemoryStoreContext,
	options: EmbedMemoryOptions = {},
): Promise<EmbedMemoryResult> {
	const provider = options.provider ?? defaultEmbeddingProvider(options.model);
	const model =
		options.model ??
		process.env.CLAUDE_GATEWAY_EMBEDDING_MODEL ??
		(provider === "gemini"
			? "gemini-embedding-2"
			: "google/embeddinggemma-300m");
	const dim =
		options.dim ?? Number(process.env.CLAUDE_GATEWAY_EMBEDDING_DIM ?? 768);
	const batchSize = Math.max(
		1,
		Math.min(
			100,
			options.batchSize ??
				Number(process.env.CLAUDE_GATEWAY_EMBEDDING_BATCH ?? 32),
		),
	);
	const limit = Math.max(
		1,
		options.limit ??
			Number(process.env.CLAUDE_GATEWAY_EMBEDDING_LIMIT ?? 1000000),
	);

	if (provider === "local") {
		return embedMissingChunksLocal(ctx, { model, dim, batchSize, limit });
	}
	const providers = embeddingProviderChain(provider, model);
	if (providers.length === 0) {
		throw new Error(
			`No embedding provider in the configured chain can produce model ${model}`,
		);
	}

	const rows = ctx.db
		.query<
			{ chunk_id: string; text: string; title: string | null },
			[string, number, number]
		>(
			`SELECT c.id AS chunk_id, c.text, conv.title
         FROM chunks c
         JOIN conversations conv ON conv.id = c.conversation_id
         LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id AND e.model = ? AND e.dim = ?
         WHERE e.chunk_id IS NULL
         ORDER BY c.created_at ASC, c.id ASC
         LIMIT ?`,
		)
		.all(model, dim, limit);

	let embedded = 0;
	let activeProvider: ConcreteEmbeddingProvider | null = null;
	for (let i = 0; i < rows.length; i += batchSize) {
		const batch = rows.slice(i, i + batchSize);
		const texts = batch.map((row) =>
			retrievalDocumentText(row.text, row.title),
		);
		let providerUsed: ConcreteEmbeddingProvider;
		let vectors: number[][];
		try {
			const result = await embedTextsWithFallback(ctx, texts, {
				providers: activeProvider ? [activeProvider] : providers,
				model,
				dim,
				inputMode: "document",
			});
			providerUsed = result.provider;
			vectors = result.vectors;
			activeProvider = providerUsed;
		} catch (err) {
			if (!activeProvider) throw err;
			const remainingProviders = providers.filter(
				(candidate) => candidate !== activeProvider,
			);
			const result = await embedTextsWithFallback(ctx, texts, {
				providers: remainingProviders,
				model,
				dim,
				inputMode: "document",
			});
			providerUsed = result.provider;
			vectors = result.vectors;
			activeProvider = providerUsed;
		}
		const tx = ctx.db.transaction(() => {
			for (let j = 0; j < batch.length; j++) {
				const vector = vectors[j];
				const row = batch[j];
				if (!vector || !row) continue;
				const normalized = normalizeVector(vector);
				ctx.db
					.query(
						`INSERT OR REPLACE INTO chunk_embeddings
                 (chunk_id, provider, model, dim, embedding, norm, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						row.chunk_id,
						providerStorageName(providerUsed),
						model,
						dim,
						vectorToBlob(normalized.values),
						normalized.norm,
						nowIso(),
					);
				embedded++;
			}
		});
		tx();
	}

	return {
		provider: activeProvider ? providerStorageName(activeProvider) : provider,
		model,
		dim,
		scanned: rows.length,
		embedded,
		skipped: rows.length - embedded,
	};
}

export function embeddingSearchConfig(
	ctx: MemoryStoreContext,
): EmbeddingSearchConfig | null {
	const envModel = process.env.CLAUDE_GATEWAY_EMBEDDING_MODEL;
	const envDim = process.env.CLAUDE_GATEWAY_EMBEDDING_DIM;
	if (envModel || envDim) {
		const model = envModel ?? "google/embeddinggemma-300m";
		const dim = Number(envDim ?? 768);
		const count =
			ctx.db
				.query<{ n: number }, [string, number]>(
					"SELECT count(*) AS n FROM chunk_embeddings WHERE model = ? AND dim = ?",
				)
				.get(model, dim)?.n ?? 0;
		if (count === 0) return null;
		return { provider: defaultEmbeddingProvider(model), model, dim, count };
	}

	const row = ctx.db
		.query<{ model: string; dim: number; n: number }, []>(
			`SELECT model, dim, count(*) AS n
         FROM chunk_embeddings
         GROUP BY model, dim
         ORDER BY n DESC
         LIMIT 1`,
		)
		.get();
	if (!row || row.n === 0) return null;
	return {
		provider: defaultEmbeddingProvider(row.model),
		model: row.model,
		dim: row.dim,
		count: row.n,
	};
}

export async function embedTexts(
	ctx: MemoryStoreContext,
	texts: string[],
	options: {
		provider: EmbeddingProvider;
		model: string;
		dim: number;
		inputMode?: "document" | "query";
	},
): Promise<number[][]> {
	const providers = embeddingProviderChain(options.provider, options.model);
	if (providers.length === 0) {
		throw new Error(
			`No embedding provider in the configured chain can produce model ${options.model}`,
		);
	}
	return (await embedTextsWithFallback(ctx, texts, { ...options, providers }))
		.vectors;
}

export async function embedTextsWithFallback(
	ctx: MemoryStoreContext,
	texts: string[],
	options: {
		providers: ConcreteEmbeddingProvider[];
		model: string;
		dim: number;
		inputMode?: "document" | "query";
	},
): Promise<{ provider: ConcreteEmbeddingProvider; vectors: number[][] }> {
	let lastError: unknown;
	for (const provider of options.providers) {
		try {
			const vectors =
				provider === "gemini"
					? await embedTextsGemini(ctx, texts, options.model, options.dim)
					: provider === "modal"
						? await embedTextsModal(
								ctx,
								texts,
								options.model,
								options.dim,
								options.inputMode ?? "document",
							)
						: await embedTextsLocal(
								ctx,
								texts,
								options.model,
								options.dim,
								options.inputMode ?? "document",
							);
			return { provider, vectors };
		} catch (err) {
			lastError = err;
			console.warn(
				`[memory] ${provider} embedding failed; trying next provider when available:`,
				err,
			);
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error(String(lastError ?? "No embedding provider succeeded"));
}

export async function embedMissingChunksLocal(
	ctx: MemoryStoreContext,
	options: {
		model: string;
		dim: number;
		batchSize: number;
		limit: number;
	},
): Promise<EmbedMemoryResult> {
	const model = localEmbeddingModelName(options.model);
	const { stdout } = await runLocalEmbeddingHelper(
		[
			"--mode",
			"backfill",
			"--db",
			ctx.dbPath,
			"--model",
			model,
			"--dim",
			String(options.dim),
			"--batch-size",
			String(options.batchSize),
			"--limit",
			String(options.limit),
		],
		undefined,
		{
			timeoutMs:
				Number(process.env.CLAUDE_GATEWAY_LOCAL_EMBEDDING_TIMEOUT_MS ?? 0) ||
				undefined,
		},
	);
	return JSON.parse(
		stdout.trim().split(/\r?\n/).at(-1) ?? stdout,
	) as EmbedMemoryResult;
}

export async function embedTextsLocal(
	ctx: MemoryStoreContext,
	texts: string[],
	model: string,
	dim: number,
	inputMode: "document" | "query" = "document",
): Promise<number[][]> {
	if (texts.length === 0) return [];
	const localModel = localEmbeddingModelName(model);
	const { stdout } = await runLocalEmbeddingHelper(
		["--mode", "embed-texts", "--model", localModel, "--dim", String(dim)],
		{ mode: inputMode, texts },
		{
			timeoutMs: Number(
				process.env.CLAUDE_GATEWAY_LOCAL_EMBEDDING_QUERY_TIMEOUT_MS ?? 120000,
			),
		},
	);
	const payload = JSON.parse(stdout) as { vectors?: number[][] };
	return payload.vectors ?? [];
}

export async function embedTextsModal(
	ctx: MemoryStoreContext,
	texts: string[],
	model: string,
	dim: number,
	inputMode: "document" | "query" = "document",
): Promise<number[][]> {
	if (texts.length === 0) return [];
	const localModel = localEmbeddingModelName(model);
	const { stdout } = await runModalEmbeddingHelper(
		["--mode", "embed-texts", "--model-name", localModel, "--dim", String(dim)],
		{ mode: inputMode, texts },
		{
			timeoutMs: Number(
				process.env.CLAUDE_GATEWAY_MODAL_EMBEDDING_TIMEOUT_MS ?? 600000,
			),
		},
	);
	const jsonLine = stdout
		.trim()
		.split(/\r?\n/)
		.reverse()
		.find((line) => line.trim().startsWith("{"));
	const payload = JSON.parse(jsonLine ?? stdout) as { vectors?: number[][] };
	return payload.vectors ?? [];
}

export async function embedTextsGemini(
	ctx: MemoryStoreContext,
	texts: string[],
	model: string,
	dim: number,
): Promise<number[][]> {
	const apiKey =
		loadEnvValue("GEMINI_API_KEY") ?? loadEnvValue("GOOGLE_API_KEY");
	if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
	if (texts.length === 0) return [];

	const endpoint = `https://generativelanguage.googleapis.com/v1beta/${geminiModelName(model)}:batchEmbedContents`;
	const body = {
		requests: texts.map((text) => ({
			model: geminiModelName(model),
			content: { parts: [{ text }] },
			outputDimensionality: dim,
		})),
	};

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-goog-api-key": apiKey,
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`Gemini embedding request failed: ${response.status} ${text.slice(0, 500)}`,
		);
	}

	const payload = (await response.json()) as {
		embeddings?: Array<{ values?: number[] }>;
	};
	const embeddings = payload.embeddings ?? [];
	if (embeddings.length !== texts.length) {
		throw new Error(
			`Gemini returned ${embeddings.length} embeddings for ${texts.length} inputs`,
		);
	}
	return embeddings.map((embedding) => embedding.values ?? []);
}
