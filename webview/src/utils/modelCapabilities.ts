/**
 * Infer native Codex MAX reasoning support for models known by their ID.
 * Custom-model metadata can explicitly override this legacy fallback.
 */
export function codexModelSupportsMaxEffort(modelId: string): boolean {
  return modelId.trim().toLowerCase().includes('gpt-5.6');
}
