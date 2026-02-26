import { estimateUtf8Bytes, splitTextToUtf8ByteLimit } from "@/memory/embedding-input-limits.js";
import { resolveEmbeddingMaxInputTokens } from "@/memory/embedding-model-limits.js";
import type { EmbeddingProvider } from "@/memory/embeddings.js";
import { hashText, type MemoryChunk } from "@/memory/internal.js";

export function enforceEmbeddingMaxInputTokens(
  provider: EmbeddingProvider,
  chunks: MemoryChunk[],
  hardMaxInputTokens?: number,
): MemoryChunk[] {
  const providerMaxInputTokens = resolveEmbeddingMaxInputTokens(provider);
  const maxInputTokens =
    typeof hardMaxInputTokens === "number" && hardMaxInputTokens > 0
      ? Math.min(providerMaxInputTokens, hardMaxInputTokens)
      : providerMaxInputTokens;
  const out: MemoryChunk[] = [];

  for (const chunk of chunks) {
    if (estimateUtf8Bytes(chunk.text) <= maxInputTokens) {
      out.push(chunk);
      continue;
    }

    for (const text of splitTextToUtf8ByteLimit(chunk.text, maxInputTokens)) {
      out.push({
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        text,
        hash: hashText(text),
      });
    }
  }

  return out;
}
