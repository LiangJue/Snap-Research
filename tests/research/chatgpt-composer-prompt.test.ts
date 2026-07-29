import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { insertChatGptResearchPrompt } from '@services/research/content/chatgpt-composer-prompt';

let dom: JSDOM | null = null;

beforeEach(() => {
  dom = new JSDOM(
    '<!doctype html><html><body><main><form><div id="prompt-textarea" contenteditable="true"></div><button type="button" data-testid="send-button">Send</button></form></main></body></html>',
    {
      url: 'https://chatgpt.com/',
      pretendToBeVisual: true,
    },
  );
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: dom.window.location });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'getSelection', {
    configurable: true,
    value: dom.window.getSelection.bind(dom.window),
  });
});

afterEach(() => {
  vi.useRealTimers();
  dom = null;
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).location;
});

describe('ChatGPT screenshot research composer', () => {
  it('inserts the prompt without sending it', () => {
    const element = document.querySelector('#prompt-textarea') as HTMLElement;
    (element as any).getBoundingClientRect = () => ({
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
    });

    expect(insertChatGptResearchPrompt('研究这张截图')).toBe(true);
    expect(element.textContent).toBe('研究这张截图');
  });

  it('stops controlling the composer after inserting the prompt', () => {
    vi.useFakeTimers();
    const prompt = '研究这张截图\n\n研究要求：\n1. 核查其中的事实';
    const element = document.querySelector('#prompt-textarea') as HTMLElement;
    (element as any).getBoundingClientRect = () => ({
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
    });

    expect(insertChatGptResearchPrompt(prompt)).toBe(true);
    const sendButton = document.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    sendButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    element.closest('form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    vi.advanceTimersByTime(10_000);

    expect(element.textContent).toBe(prompt);
  });

  it('does not clear the prompt before ChatGPT captures text for an image submission', () => {
    vi.useFakeTimers();
    const prompt = '研究这张截图\n\n研究要求：\n1. 核查其中的事实';
    const element = document.querySelector('#prompt-textarea') as HTMLElement;
    (element as any).getBoundingClientRect = () => ({
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
    });

    expect(insertChatGptResearchPrompt(prompt)).toBe(true);
    const sendButton = document.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    let capturedText = '';
    sendButton.addEventListener('click', () => {
      // ChatGPT can defer reading the ProseMirror value while it finalizes an
      // image attachment. The extension must not erase it in the meantime.
      setTimeout(() => {
        capturedText = String(element.textContent || '');
      }, 200);
    });

    sendButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(10_000);

    expect(capturedText).toBe(prompt);
  });

  it('leaves a user-edited draft under ChatGPT control', () => {
    vi.useFakeTimers();
    const element = document.querySelector('#prompt-textarea') as HTMLElement;
    (element as any).getBoundingClientRect = () => ({
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
    });

    expect(insertChatGptResearchPrompt('研究这张截图')).toBe(true);
    element.textContent = '用户修改后的追问';
    const form = element.closest('form') as HTMLFormElement;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(10_000);

    expect(element.textContent).toBe('用户修改后的追问');
  });
});
