import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerCurrentPageCaptureContentHandlers } from '@services/bootstrap/current-page-capture-content-handlers';

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error test global cleanup
  delete globalThis.chrome;
});

describe('current-page-capture content handlers', () => {
  it('shows inpage tip progress when capture is triggered from context menu', async () => {
    let registeredListener: any = null;
    const addListener = vi.fn((listener: any) => {
      registeredListener = listener;
    });

    // @ts-expect-error test global
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener,
          removeListener: vi.fn(),
        },
      },
    };

    const captureCurrentPage = vi.fn(async (input?: any) => {
      input?.onProgress?.({ message: 'Saving...', kind: 'default' });
      input?.onProgress?.({ message: 'Saved: Hello', kind: 'default' });
      return { title: 'Hello' };
    });

    const showSaveTip = vi.fn();

    registerCurrentPageCaptureContentHandlers(
      {
        // Not used in this test.
        getCurrentPageCaptureState: vi.fn(),
        captureCurrentPage,
      } as any,
      { inpageTip: { showSaveTip } },
    );

    expect(addListener).toHaveBeenCalledTimes(1);

    let response: any = null;
    const returned = registeredListener?.(
      { type: 'captureCurrentPage', payload: { source: 'contextmenu' } },
      {},
      (value: any) => {
        response = value;
      },
    );

    expect(returned).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(captureCurrentPage).toHaveBeenCalledTimes(1);
    expect(showSaveTip).toHaveBeenCalledWith('Saving...', { kind: 'default' });
    expect(showSaveTip).toHaveBeenCalledWith('Saved: Hello', { kind: 'default' });
    expect(response?.ok).toBe(true);
    expect(response?.data).toEqual({ title: 'Hello' });
  });

  it('routes ChatGPT Research preview and confirmed import separately', async () => {
    let registeredListener: any = null;
    // @ts-expect-error test global
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: (listener: any) => {
            registeredListener = listener;
          },
          removeListener: vi.fn(),
        },
      },
    };
    const service = {
      getCurrentPageCaptureState: vi.fn(),
      captureCurrentPage: vi.fn(),
      previewCurrentChatGptResearch: vi.fn(async () => ({ reportId: 'report-1', taskCount: 2 })),
      importCurrentChatGptResearch: vi.fn(async () => ({ reportId: 'report-1', imported: 2 })),
    };
    registerCurrentPageCaptureContentHandlers(service as any);

    const previewResponse = await new Promise<any>((resolve) => {
      expect(registeredListener({ type: 'previewCurrentChatGptResearch' }, {}, resolve)).toBe(true);
    });
    expect(previewResponse).toMatchObject({ ok: true, data: { reportId: 'report-1', taskCount: 2 } });

    const importResponse = await new Promise<any>((resolve) => {
      expect(
        registeredListener({ type: 'importCurrentChatGptResearch', payload: { saveConversation: false } }, {}, resolve),
      ).toBe(true);
    });
    expect(service.importCurrentChatGptResearch).toHaveBeenCalledWith({ saveConversation: false });
    expect(importResponse).toMatchObject({ ok: true, data: { reportId: 'report-1', imported: 2 } });
  });
});
