/**
 * Infer native Codex MAX reasoning support for models known by their ID.
 * Custom-model metadata can explicitly override this legacy fallback.
 */
export function codexModelSupportsMaxEffort(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id.includes('gpt-5.6') || id.includes('gpt-6');
}

export function customModelSupportsMaxReasoningEffort(model: {
  id: string;
  supportsMaxReasoningEffort?: boolean;
}): boolean {
  return model.supportsMaxReasoningEffort ?? codexModelSupportsMaxEffort(model.id);
}
