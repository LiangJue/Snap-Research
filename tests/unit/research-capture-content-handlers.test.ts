import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerResearchCaptureContentHandlers } from '@services/research/content/capture-controller';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Research capture checklist seam', () => {
  it('captures a screenshot for ChatGPT without requesting candidate claims from the Research API', async () => {
    let listener: ((message: any, sender: any, sendResponse: (value: any) => void) => unknown) | null = null;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    const send = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        captureDraft: {
          imageDataUrl: 'data:image/png;base64,AAAA',
          pageTitle: '截图来源',
        },
      },
    });
    const overlay = { open: vi.fn(), openTextSelection: vi.fn() };
    registerResearchCaptureContentHandlers({ send }, overlay);

    listener?.({ type: 'openResearchCapture' }, {}, vi.fn());
    const callbacks = overlay.open.mock.calls[0][0];
    const submission = {
      question: '核查数字',
      pageTitle: '截图来源',
      pageUrl: 'https://example.com/screenshot',
      selectedText: '',
      extractedText: '',
      viewportWidth: 1280,
      viewportHeight: 720,
      rect: { x: 1, y: 2, width: 300, height: 200, devicePixelRatio: 1 },
    };
    const captured = await callbacks.onCaptureForChatGpt(submission);

    expect(captured.captureDraft.imageDataUrl).toContain('data:image/png');
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('captureResearchRegionForChatGpt', submission);
  });

  it('opens the checklist from selected text without requesting a region screenshot', async () => {
    let listener: ((message: any, sender: any, sendResponse: (value: any) => void) => unknown) | null = null;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          candidateClaims: [{ id: 'claim-1', text: '纯文字观点', selected: true }],
          captureDraft: {
            imageDataUrl: '',
            pageTitle: '来源页面',
            pageUrl: 'https://example.com/article',
            selectedText: '纯文字观点',
          },
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { report: { id: 'report-text' }, tasks: [{ id: 'task-text' }] } });
    const overlay = { open: vi.fn(), openTextSelection: vi.fn() };
    registerResearchCaptureContentHandlers({ send }, overlay);

    listener?.(
      {
        type: 'openResearchTextSelection',
        payload: {
          selectionText: '纯文字观点',
          pageTitle: '来源页面',
          pageUrl: 'https://example.com/article',
        },
      },
      {},
      vi.fn(),
    );

    const callbacks = overlay.openTextSelection.mock.calls[0][0];
    const extracted = await callbacks.onExtract({
      question: '优先查找真实案例。',
      pageTitle: '来源页面',
      pageUrl: 'https://example.com/article',
      selectedText: '纯文字观点',
      extractedText: '纯文字观点',
      viewportWidth: 1,
      viewportHeight: 1,
      rect: { x: 0, y: 0, width: 1, height: 1, devicePixelRatio: 1 },
    });
    await callbacks.onCreate({
      captureDraft: extracted.captureDraft,
      candidateClaims: extracted.candidateClaims,
      executionMode: 'chatgpt_manual',
    });

    expect(send.mock.calls[0]).toEqual([
      'extractResearchClaimsFromText',
      expect.objectContaining({
        selectedText: '纯文字观点',
        pageTitle: '来源页面',
        pageUrl: 'https://example.com/article',
        question: '优先查找真实案例。',
      }),
    ]);
    expect(send.mock.calls[0][1]).not.toHaveProperty('imageDataUrl');
    expect(send.mock.calls[1][0]).toBe('createResearchReportFromRegion');
    expect(send.mock.calls[1][1]).toMatchObject({ executionMode: 'chatgpt_manual' });
  });

  it('extracts claims first and creates one report from the selected checklist', async () => {
    let listener: ((message: any, sender: any, sendResponse: (value: any) => void) => unknown) | null = null;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          candidateClaims: [
            { id: 'claim-1', text: '观点一', selected: true },
            { id: 'claim-2', text: '观点二', selected: true },
          ],
          captureDraft: { imageDataUrl: 'data:image/png;base64,AAAA', pageTitle: '页面' },
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { report: { id: 'report-1' }, tasks: [{ id: 'task-1' }] } });
    const overlay = { open: vi.fn(), openTextSelection: vi.fn() };
    registerResearchCaptureContentHandlers({ send }, overlay);

    listener?.({ type: 'openResearchCapture' }, {}, vi.fn());
    const callbacks = overlay.open.mock.calls[0][0];
    const submission = {
      question: '',
      pageTitle: '页面',
      pageUrl: 'https://example.com',
      selectedText: '',
      extractedText: '观点一。观点二。',
      viewportWidth: 1280,
      viewportHeight: 720,
      rect: { x: 1, y: 2, width: 300, height: 200, devicePixelRatio: 1 },
    };
    const extracted = await callbacks.onExtract(submission);
    await callbacks.onCreate({
      captureDraft: extracted.captureDraft,
      executionMode: 'api',
      candidateClaims: [
        { ...extracted.candidateClaims[0], text: '编辑后的观点一' },
        { ...extracted.candidateClaims[1], selected: false },
      ],
    });

    expect(send.mock.calls[0][0]).toBe('extractResearchClaimsFromRegion');
    expect(send.mock.calls[1]).toEqual([
      'createResearchReportFromRegion',
      {
        captureDraft: { imageDataUrl: 'data:image/png;base64,AAAA', pageTitle: '页面' },
        executionMode: 'api',
        candidateClaims: [
          { id: 'claim-1', text: '编辑后的观点一', selected: true },
          { id: 'claim-2', text: '观点二', selected: false },
        ],
      },
    ]);
  });
});
