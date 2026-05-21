// Re-export surface. Pipeline implementations live in the modular
// loader and registry layers.
export { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
export { PipelineLoader } from "@/gateway/loaders/pipelines/pipeline-loader.ts";
export * from "@/gateway/registries/pipelines/index.ts";
