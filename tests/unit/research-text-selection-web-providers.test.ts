// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { researchCaptureOverlay } from '@ui/research/capture-overlay-shadow';

afterEach(() => {
  document.getElementById('syncnos-research-capture-host')?.remove();
  vi.restoreAllMocks();
});

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('selected-text web research providers', () => {
  it('sends the raw selected text directly to Kimi without claim extraction or the Research API', async () => {
    const onOpenKimi = vi.fn();
    const onExtract = vi.fn();
    const onCreate = vi.fn().mockResolvedValue({ chatGptPrompt: 'Prompt containing the selected text' });
    researchCaptureOverlay.openTextSelection({
      source: {
        selectionText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
        pageTitle: 'Agent目前最大的瓶颈是什么？',
        pageUrl: 'https://www.zhihu.com/question/example',
      },
      onOpenChatGpt: vi.fn(),
      onOpenKimi,
      onExtract,
      onCreate,
    });

    const shadow = document.getElementById('syncnos-research-capture-host')?.shadowRoot;
    const chatgpt = shadow?.querySelector<HTMLButtonElement>('.chatgpt');
    const kimi = shadow?.querySelector<HTMLButtonElement>('.kimi');
    expect(chatgpt?.textContent).toBe('文字直送 ChatGPT（无需 API）');
    expect(kimi?.textContent).toBe('文字直送 Kimi（无需 API）');

    kimi?.click();
    await flushAsyncWork();

    expect(onExtract).not.toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'kimi_text',
        candidateClaims: [],
        captureDraft: expect.objectContaining({
          selectedText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
          imageDataUrl: '',
        }),
      }),
    );
    expect(onOpenKimi).toHaveBeenCalledWith('Prompt containing the selected text');
  });

  it('offers both ChatGPT and Kimi without the Research API after claims are extracted', async () => {
    const onOpenChatGpt = vi.fn();
    const onOpenKimi = vi.fn();
    const onCreate = vi.fn().mockResolvedValue({ chatGptPrompt: 'Kimi structured research prompt' });
    researchCaptureOverlay.openTextSelection({
      source: {
        selectionText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
        pageTitle: 'Agent目前最大的瓶颈是什么？',
        pageUrl: 'https://www.zhihu.com/question/example',
      },
      onOpenChatGpt,
      onOpenKimi,
      onExtract: vi.fn().mockResolvedValue({
        candidateClaims: [{ id: 'claim-1', text: 'Agent 长程任务的可靠闭环执行能力不足。', selected: true }],
        captureDraft: {
          question: '',
          pageTitle: 'Agent目前最大的瓶颈是什么？',
          pageUrl: 'https://www.zhihu.com/question/example',
          selectedText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
          extractedText: 'Agent 长程任务的可靠闭环执行能力严重不足。',
          imageDataUrl: '',
          rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
        },
      }),
      onCreate,
    });

    const shadow = document.getElementById('syncnos-research-capture-host')?.shadowRoot;
    const extract = shadow?.querySelector<HTMLButtonElement>('.submit');
    extract?.click();
    await flushAsyncWork();

    const chatgpt = shadow?.querySelector<HTMLButtonElement>('.chatgpt');
    const kimi = shadow?.querySelector<HTMLButtonElement>('.kimi');
    expect(chatgpt?.style.display).toBe('inline-block');
    expect(chatgpt?.textContent).toContain('ChatGPT');
    expect(chatgpt?.textContent).toContain('无需 API');
    expect(kimi?.style.display).toBe('inline-block');
    expect(kimi?.textContent).toContain('Kimi');
    expect(kimi?.textContent).toContain('无需 API');

    kimi?.click();
    await flushAsyncWork();

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'kimi_manual',
        candidateClaims: [expect.objectContaining({ id: 'claim-1', selected: true })],
      }),
    );
    expect(onOpenKimi).toHaveBeenCalledWith('Kimi structured research prompt');
    expect(onOpenChatGpt).not.toHaveBeenCalled();
  });
});
