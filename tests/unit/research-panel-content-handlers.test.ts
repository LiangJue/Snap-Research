import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerInpageResearchPanelContentHandlers } from '../../src/services/research/content/research-panel-content-handlers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('research panel content handlers', () => {
  it('opens the reusable in-page panel for a valid research task', () => {
    let listener: ((message: any, sender: any, sendResponse: (value: any) => void) => unknown) | null = null;
    const removeListener = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
          removeListener,
        },
      },
    });
    const panel = {
      open: vi.fn(),
    };
    const beforeOpen = vi.fn();
    const cleanup = registerInpageResearchPanelContentHandlers({ panel, beforeOpen });
    const sendResponse = vi.fn();

    expect(listener).not.toBeNull();
    listener?.(
      {
        type: 'openInpageResearchPanel',
        payload: {
          taskId: ' task-9 ',
          cardId: ' card-3 ',
          status: ' completed ',
          conversationId: 41,
          source: ' research ',
          conversationKey: ' research:task-9 ',
          title: ' 核查详情 ',
          url: ' https://example.com/source ',
        },
      },
      {},
      sendResponse,
    );

    expect(beforeOpen).toHaveBeenCalledOnce();
    expect(panel.open).toHaveBeenCalledWith({
      taskId: 'task-9',
      cardId: 'card-3',
      status: 'completed',
      conversationId: 41,
      source: 'research',
      conversationKey: 'research:task-9',
      title: '核查详情',
      url: 'https://example.com/source',
    });
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });

    cleanup();
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('does not open the panel when the task id is missing', () => {
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
    const panel = {
      open: vi.fn(),
    };
    const sendResponse = vi.fn();
    registerInpageResearchPanelContentHandlers({ panel });

    listener?.({ type: 'openInpageResearchPanel', payload: {} }, {}, sendResponse);

    expect(panel.open).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'research task is unavailable' });
  });
});
