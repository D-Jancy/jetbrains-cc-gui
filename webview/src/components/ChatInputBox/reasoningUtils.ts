import { useEffect, useMemo } from 'react';
import {
  EFFORT_SUPPORTED_CLAUDE_MODELS,
  MAX_EFFORT_CLAUDE_MODELS,
  REASONING_LEVELS,
  XHIGH_EFFORT_CLAUDE_MODELS,
  type ReasoningEffort,
  type ReasoningInfo,
} from './types';
import { codexModelSupportsMaxEffort } from '../../utils/modelCapabilities';

export function isReasoningVisible(currentProvider?: string, selectedModel?: string): boolean {
  return currentProvider !== 'claude' || !selectedModel || EFFORT_SUPPORTED_CLAUDE_MODELS.has(selectedModel);
}

export function getAvailableReasoningLevels(
  currentProvider?: string,
  selectedModel?: string,
  supportsMaxReasoningEffort?: boolean,
): ReasoningInfo[] {
  return REASONING_LEVELS.filter((level) => {
    if (currentProvider === 'grok') {
      return level.id === 'low' || level.id === 'medium' || level.id === 'high';
    }
    if (currentProvider === 'codex') {
      const supportsMax = supportsMaxReasoningEffort
        ?? (selectedModel !== undefined && codexModelSupportsMaxEffort(selectedModel));
      return level.id !== 'max' || supportsMax;
    }
    if (currentProvider !== 'claude') {
      return level.id !== 'max';
    }
    if (!selectedModel) {
      return true;
    }
    if (level.id === 'xhigh') {
      return XHIGH_EFFORT_CLAUDE_MODELS.has(selectedModel);
    }
    if (level.id === 'max') {
      return MAX_EFFORT_CLAUDE_MODELS.has(selectedModel);
    }
    return true;
  });
}

export function resolveCurrentReasoningLevel(
  value: ReasoningEffort,
  availableLevels: ReasoningInfo[],
): ReasoningInfo | undefined {
  return availableLevels.find((level) => level.id === value)
    || availableLevels[availableLevels.length - 2]
    || availableLevels[0];
}

export function useReasoningEffortGuard(
  value: ReasoningEffort,
  onChange: (effort: ReasoningEffort) => void,
  selectedModel?: string,
  currentProvider?: string,
  supportsMaxReasoningEffort?: boolean,
): {
  isVisible: boolean;
  availableLevels: ReasoningInfo[];
  currentLevel: ReasoningInfo | undefined;
} {
  const isVisible = isReasoningVisible(currentProvider, selectedModel);
  const availableLevels = useMemo(
    () => getAvailableReasoningLevels(currentProvider, selectedModel, supportsMaxReasoningEffort),
    [currentProvider, selectedModel, supportsMaxReasoningEffort],
  );
  const currentLevel = resolveCurrentReasoningLevel(value, availableLevels);

  useEffect(() => {
    if (!isVisible || availableLevels.some((level) => level.id === value)) {
      return;
    }
    if (currentLevel) {
      onChange(currentLevel.id);
    }
  }, [availableLevels, currentLevel, isVisible, onChange, value]);

  return { isVisible, availableLevels, currentLevel };
}
