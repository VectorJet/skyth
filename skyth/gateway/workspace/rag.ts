/**
 * Workspace RAG indexer.
 *
 * Phase 3: tries to use a local embedding model
 * (`Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`) for dense retrieval
 * with cosine similarity. If the model can't be loaded (the package is
 * optional, and onnxruntime-web compatibility under Bun is best-effort), we
 * fall back transparently to the original BM25 implementation so `/rag`
 * keeps working even without any model.
 *
 *   - Walks the workspace's `notes/`, `INBOX/`, `OUTBOX/`, and `rag/source/`
 *     directories.
 *   - Splits files into ~600-char chunks with 60-char overlap.
 *   - Persists `rag/index.json` with chunk text, term frequencies (BM25),
 *     and (optionally) dense vectors.
 *
 * Index file shape:
 *   {
 *     mode: 'embeddings' | 'bm25',
 *     model?: 'Xenova/all-MiniLM-L6-v2',
 *     dim?: number,
 *     builtAt, totalChunks, avgLen, df, chunks: [{ ..., embedding?: number[] }]
 *   }
 */
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { extname, join } from "path";
import type { Workspace } from "@/gateway/workspace/index.ts";

const DEFAULT_CHUNK = 600;
const DEFAULT_OVERLAP = 60;
const INDEXED_EXT = new Set([
	".md",
	".txt",
	".json",
	".ts",
	".js",
	".py",
	".rs",
	".toml",
	".yaml",
	".yml",
]);
const INDEXED_DIRS = ["notes", "INBOX", "OUTBOX", "rag/source"];
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

interface Chunk {
	id: string;
	file: string;
	start: number;
	text: string;
	/** term -> frequency (in this chunk) */
	tf: Record<string, number>;
	len: number;
	/** Optional dense embedding (Phase 3). */
	embedding?: number[];
}

interface Index {
	mode: "embeddings" | "bm25";
	model?: string;
	dim?: number;
	builtAt: number;
	totalChunks: number;
	avgLen: number;
	/** term -> # chunks containing it */
	df: Record<string, number>;
	chunks: Chunk[];
}

const STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"are",
	"but",
	"not",
	"you",
	"all",
	"can",
	"her",
	"was",
	"one",
	"our",
	"out",
	"day",
	"get",
	"has",
	"him",
	"his",
	"how",
	"its",
	"may",
	"new",
	"now",
	"old",
	"see",
	"two",
	"who",
	"boy",
	"did",
	"let",
	"put",
	"say",
	"she",
	"too",
	"use",
	"that",
	"this",
	"with",
	"from",
	"have",
	"will",
	"they",
	"their",
	"what",
	"when",
	"your",
	"about",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, " ")
		.split(" ")
		.filter((t) => t && t.length > 2 && !STOPWORDS.has(t));
}

function chunkText(
	text: string,
	chunkSize = DEFAULT_CHUNK,
	overlap = DEFAULT_OVERLAP,
): { start: number; text: string }[] {
	const out: { start: number; text: string }[] = [];
	if (text.length <= chunkSize) return [{ start: 0, text }];
	let i = 0;
	while (i < text.length) {
		out.push({ start: i, text: text.slice(i, i + chunkSize) });
		i += chunkSize - overlap;
	}
	return out;
}

async function* walk(dir: string): AsyncGenerator<string> {
	if (!existsSync(dir)) return;
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(full);
		} else if (entry.isFile() && INDEXED_EXT.has(extname(entry.name))) {
			yield full;
		}
	}
}

/**
 * Try to lazy-load `@xenova/transformers` and return an embed function. The
 * package is optional; if it isn't installed (or fails to initialize the
 * onnxruntime-web backend under Bun), this returns null and the indexer
 * silently falls back to BM25.
 */
type Embedder = (texts: string[]) => Promise<number[][]>;

async function tryLoadEmbedder(): Promise<{
	embed: Embedder;
	dim: number;
	model: string;
} | null> {
	if (process.env.CLAUDE_GATEWAY_RAG_BM25 === "1") {
		return null; // explicit override
	}
	try {
		// @ts-expect-error — optional peer dep, may not be present.
		const mod: any = await import("@xenova/transformers");
		const pipeline = mod.pipeline ?? mod.default?.pipeline;
		if (!pipeline) return null;
		const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, {
			quantized: true,
		});
		const embed: Embedder = async (texts) => {
			const out: number[][] = [];
			for (const t of texts) {
				const result = await extractor(t, { pooling: "mean", normalize: true });
				const arr = Array.from(result.data as Float32Array | number[]);
				out.push(arr as number[]);
			}
			return out;
		};
		// Probe to discover dimension.
		const probe = await embed(["probe"]);
		return { embed, dim: probe[0]!.length, model: EMBEDDING_MODEL };
	} catch (err) {
		console.warn(
			"[rag] embedding model unavailable, falling back to BM25:",
			(err as Error).message,
		);
		return null;
	}
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
	// Embeddings are L2-normalized by the extractor (`normalize: true`), so
	// dot product == cosine similarity.
	return dot;
}

export class RagIndex {
	constructor(private workspace: Workspace) {}

	private indexPath(): string {
		return join(this.workspace.root, "rag", "index.json");
	}

	/**
	 * Re-build the index from disk. Returns the chunk count. Uses dense
	 * embeddings when available, otherwise BM25.
	 */
	async rebuild(): Promise<number> {
		const chunks: Chunk[] = [];
		const df = new Map<string, number>();

		for (const dirName of INDEXED_DIRS) {
			const dir = join(this.workspace.root, dirName);
			for await (const file of walk(dir)) {
				let body = "";
				try {
					const s = await stat(file);
					if (s.size > 5_000_000) continue;
					body = await readFile(file, "utf8");
				} catch {
					continue;
				}
				const rel = file.slice(this.workspace.root.length + 1);
				for (const c of chunkText(body)) {
					const tokens = tokenize(c.text);
					if (tokens.length === 0) continue;
					const tf: Record<string, number> = {};
					for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
					const id = `${rel}#${c.start}`;
					chunks.push({
						id,
						file: rel,
						start: c.start,
						text: c.text,
						tf,
						len: tokens.length,
					});
					for (const t of Object.keys(tf)) df.set(t, (df.get(t) ?? 0) + 1);
				}
			}
		}

		const embedder = await tryLoadEmbedder();
		let mode: Index["mode"] = "bm25";
		let model: string | undefined;
		let dim: number | undefined;
		if (embedder && chunks.length > 0) {
			try {
				// Batch in groups so we don't blow memory on a huge corpus.
				const BATCH = 16;
				for (let i = 0; i < chunks.length; i += BATCH) {
					const slice = chunks.slice(i, i + BATCH);
					const vecs = await embedder.embed(slice.map((c) => c.text));
					for (let j = 0; j < slice.length; j++) slice[j]!.embedding = vecs[j];
				}
				mode = "embeddings";
				model = embedder.model;
				dim = embedder.dim;
			} catch (err) {
				console.warn(
					"[rag] embedding rebuild failed, persisting BM25-only index:",
					err,
				);
				for (const c of chunks) delete c.embedding;
			}
		}

		const avgLen =
			chunks.length === 0
				? 0
				: chunks.reduce((s, c) => s + c.len, 0) / chunks.length;
		const index: Index = {
			mode,
			model,
			dim,
			builtAt: Date.now(),
			totalChunks: chunks.length,
			avgLen,
			df: Object.fromEntries(df),
			chunks,
		};
		await writeFile(this.indexPath(), JSON.stringify(index));
		return chunks.length;
	}

	async load(): Promise<Index | null> {
		try {
			const raw = await readFile(this.indexPath(), "utf8");
			return JSON.parse(raw) as Index;
		} catch {
			return null;
		}
	}

	/**
	 * Hybrid search. If the index was built with embeddings, use cosine
	 * similarity over the query embedding; otherwise fall back to BM25. If
	 * embedding the query fails at search time, also fall back to BM25.
	 */
	async search(
		query: string,
		k = 5,
	): Promise<{ chunk: Chunk; score: number }[]> {
		const idx = await this.load();
		if (!idx || idx.totalChunks === 0) return [];

		if (idx.mode === "embeddings") {
			const embedder = await tryLoadEmbedder();
			if (embedder) {
				try {
					const [qv] = await embedder.embed([query]);
					const scores: { chunk: Chunk; score: number }[] = [];
					for (const c of idx.chunks) {
						if (!c.embedding) continue;
						scores.push({ chunk: c, score: cosine(qv!, c.embedding) });
					}
					scores.sort((a, b) => b.score - a.score);
					return scores.slice(0, k);
				} catch (err) {
					console.warn(
						"[rag] query embedding failed, falling back to BM25:",
						err,
					);
				}
			}
		}

		return bm25Search(idx, query, k);
	}
}

function bm25Search(
	idx: Index,
	query: string,
	k: number,
): { chunk: Chunk; score: number }[] {
	const k1 = 1.5,
		b = 0.75;
	const N = idx.totalChunks;
	const qTerms = tokenize(query);
	const scores: { chunk: Chunk; score: number }[] = [];
	for (const c of idx.chunks) {
		let s = 0;
		for (const t of qTerms) {
			const f = c.tf[t];
			if (!f) continue;
			const dft = idx.df[t] ?? 1;
			const idf = Math.log(1 + (N - dft + 0.5) / (dft + 0.5));
			const norm = 1 - b + b * (c.len / (idx.avgLen || 1));
			s += idf * ((f * (k1 + 1)) / (f + k1 * norm));
		}
		if (s > 0) scores.push({ chunk: c, score: s });
	}
	scores.sort((a, b) => b.score - a.score);
	return scores.slice(0, k);
}
