import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../types/provider';
import { ButtonArea } from './ButtonArea';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/providers/useCliModels', () => ({
  useCliModels: () => ({
    cliModels: [],
    cliModelsLoading: false,
    cliModelsError: null,
    cliDefaultModel: null,
    cliCatalogHasEntries: false,
    refreshCliModels: vi.fn(),
  }),
}));

vi.mock('./hooks/useToolbarSelectorCompact', () => ({
  useToolbarSelectorCompact: () => false,
}));

vi.mock('./selectors', () => ({
  ConfigSelect: () => null,
  ProviderSelect: () => null,
  ModeSelect: () => null,
  ModelSelect: () => null,
  CodexFastModeSelect: () => null,
  ReasoningSelect: ({ supportsMaxReasoningEffort }: { supportsMaxReasoningEffort?: boolean }) => (
    <div
      data-testid="reasoning-select"
      data-supports-max={String(supportsMaxReasoningEffort)}
    />
  ),
}));

describe('ButtonArea custom model capabilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('passes the selected custom model MAX capability to ReasoningSelect', () => {
    localStorage.setItem(STORAGE_KEYS.CODEX_CUSTOM_MODELS, JSON.stringify([{
      id: 'vendor/frontier-model',
      label: 'Frontier Model',
      supportsMaxReasoningEffort: true,
    }]));

    render(
      <ButtonArea
        currentProvider="codex"
        selectedModel="vendor/frontier-model"
      />,
    );

    expect(screen.getByTestId('reasoning-select').getAttribute('data-supports-max')).toBe('true');
  });

  it('passes an explicit false capability instead of relying on the model ID', () => {
    localStorage.setItem(STORAGE_KEYS.CODEX_CUSTOM_MODELS, JSON.stringify([{
      id: 'vendor/gpt-5.6-custom',
      label: 'Custom GPT-5.6',
      supportsMaxReasoningEffort: false,
    }]));

    render(
      <ButtonArea
        currentProvider="codex"
        selectedModel="vendor/gpt-5.6-custom"
      />,
    );

    expect(screen.getByTestId('reasoning-select').getAttribute('data-supports-max')).toBe('false');
  });
});
