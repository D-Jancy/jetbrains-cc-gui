import { STORAGE_KEYS } from '../../types/provider';

export interface CustomModelDialogTarget {
  storageKey: string;
  contextWindowEnabled: boolean;
  maxReasoningEffortEnabled: boolean;
}

/**
 * Plugin-level custom-model store and capability editors for the active chat provider.
 *
 * Grok must not fall through to the Claude store: those entries never appear in
 * the Grok model picker. MAX reasoning is opt-in for Codex and Grok custom models.
 */
export function resolveCustomModelDialogTarget(provider: string): CustomModelDialogTarget {
  if (provider === 'codex') {
    return {
      storageKey: STORAGE_KEYS.CODEX_CUSTOM_MODELS,
      contextWindowEnabled: true,
      maxReasoningEffortEnabled: true,
    };
  }
  if (provider === 'grok') {
    return {
      storageKey: STORAGE_KEYS.GROK_CUSTOM_MODELS,
      contextWindowEnabled: false,
      maxReasoningEffortEnabled: true,
    };
  }
  return {
    storageKey: STORAGE_KEYS.CLAUDE_CUSTOM_MODELS,
    contextWindowEnabled: false,
    maxReasoningEffortEnabled: false,
  };
}
