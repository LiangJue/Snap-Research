import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import ReactDOM from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { PopupWebResearchDialog } from '../../src/ui/popup/PopupShell';

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });

  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, 'Event', { configurable: true, value: dom.window.Event });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: dom.window.CustomEvent });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: dom.window.getComputedStyle.bind(dom.window),
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
}

function cleanupDom() {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).navigator;
  delete (globalThis as any).HTMLElement;
  delete (globalThis as any).Node;
  delete (globalThis as any).Event;
  delete (globalThis as any).CustomEvent;
  delete (globalThis as any).getComputedStyle;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
}

describe('PopupWebResearchDialog', () => {
  let root: ReactDOM.Root | null = null;

  beforeEach(() => {
    setupDom();
    root = ReactDOM.createRoot(document.getElementById('root')!);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    cleanupDom();
  });

  it('shows an import error inside the still-open confirmation dialog', () => {
    act(() => {
      root!.render(
        createElement(PopupWebResearchDialog, {
          preview: {
            providerId: 'chatgpt',
            providerName: 'ChatGPT',
            reportId: 'report-1',
            taskCount: 7,
            evidenceCount: 18,
            taskTitles: ['Vitamin A claim'],
            conversationTitle: 'Vitamin A research',
          },
          busy: false,
          saveConversation: true,
          errorMessage: '部分证据的变化率与原始数值不一致，已停止导入。',
          onSaveConversationChange: vi.fn(),
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }),
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    const alert = dialog?.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('部分证据的变化率与原始数值不一致，已停止导入。');
  });
});
