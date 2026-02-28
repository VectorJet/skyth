import type { EmbeddingBatchOutputLine } from "@/memory/batch-output";

export type EmbeddingBatchStatus = {
  id?: string;
  status?: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
};

export type ProviderBatchOutputLine = EmbeddingBatchOutputLine;

export const EMBEDDING_BATCH_ENDPOINT = "/v1/embeddings";
