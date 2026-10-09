import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../types/provider';
import { resolveCustomModelDialogTarget } from './customModelDialogTarget';

describe('resolveCustomModelDialogTarget', () => {
  it('keeps Grok custom models out of the Claude store and enables MAX effort', () => {
    expect(resolveCustomModelDialogTarget('grok')).toEqual({
      storageKey: STORAGE_KEYS.GROK_CUSTOM_MODELS,
      contextWindowEnabled: false,
      maxReasoningEffortEnabled: true,
    });
  });

  it('keeps Codex context window and MAX effort editing', () => {
    expect(resolveCustomModelDialogTarget('codex')).toEqual({
      storageKey: STORAGE_KEYS.CODEX_CUSTOM_MODELS,
      contextWindowEnabled: true,
      maxReasoningEffortEnabled: true,
    });
  });

  it('does not enable MAX effort for Claude', () => {
    expect(resolveCustomModelDialogTarget('claude').maxReasoningEffortEnabled).toBe(false);
    expect(resolveCustomModelDialogTarget('kimi').storageKey).toBe(STORAGE_KEYS.CLAUDE_CUSTOM_MODELS);
  });
});
