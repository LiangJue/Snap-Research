import type { ResearchExecutionMode } from '@services/research/domain/schemas';

export type ManualResearchProvider = 'chatgpt' | 'kimi';

export function isScreenshotResearchMode(mode: ResearchExecutionMode): boolean {
  return mode === 'chatgpt_screenshot' || mode === 'kimi_screenshot';
}

export function isTextFirstResearchMode(mode: ResearchExecutionMode): boolean {
  return mode === 'chatgpt_text' || mode === 'kimi_text';
}

export function isSourceFirstResearchMode(mode: ResearchExecutionMode): boolean {
  return isScreenshotResearchMode(mode) || isTextFirstResearchMode(mode);
}

export function manualResearchProviderForMode(mode: ResearchExecutionMode): ManualResearchProvider | null {
  if (mode === 'kimi_manual' || mode === 'kimi_text' || mode === 'kimi_screenshot') return 'kimi';
  if (mode === 'chatgpt_manual' || mode === 'chatgpt_text' || mode === 'chatgpt_screenshot') return 'chatgpt';
  return null;
}

export function manualResearchProviderName(provider: ManualResearchProvider): 'ChatGPT' | 'Kimi' {
  return provider === 'kimi' ? 'Kimi' : 'ChatGPT';
}
