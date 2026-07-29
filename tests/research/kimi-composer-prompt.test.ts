import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { insertKimiResearchPrompt } from '@services/research/content/kimi-composer-prompt';

let dom: JSDOM | null = null;

beforeEach(() => {
  dom = new JSDOM(
    '<!doctype html><html><body><textarea aria-label="Ask anything"></textarea><button type="button">Send</button></body></html>',
    { url: 'https://www.kimi.com/', pretendToBeVisual: true },
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
  vi.restoreAllMocks();
  dom = null;
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).location;
});

describe('Kimi screenshot research composer', () => {
  it('replaces the current draft without sending it', () => {
    const editor = document.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = 'old draft';
    (editor as any).getBoundingClientRect = () => ({ width: 300, height: 80 });
    const send = vi.fn();
    document.querySelector('button')?.addEventListener('click', send);

    expect(insertKimiResearchPrompt('研究这张截图')).toBe(true);
    expect(editor.value).toBe('研究这张截图');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not restore a prompt after Kimi clears the submitted composer', () => {
    const editor = document.querySelector('textarea') as HTMLTextAreaElement;
    (editor as any).getBoundingClientRect = () => ({ width: 300, height: 80 });

    expect(insertKimiResearchPrompt('研究这张截图')).toBe(true);
    editor.value = '';

    expect(insertKimiResearchPrompt('研究这张截图')).toBe(true);
    expect(editor.value).toBe('');
  });

  it('accepts Kimi rich-text rendering that removes prompt whitespace', () => {
    document.body.innerHTML = '<div role="textbox" contenteditable="true"></div>';
    const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
    (editor as any).getBoundingClientRect = () => ({ width: 300, height: 80 });
    (document as any).execCommand = vi.fn((_command: string, _showUi: boolean, text: string) => {
      editor.textContent = text.replace(/\s+/g, '');
      return true;
    });

    expect(insertKimiResearchPrompt('第一段\n第二段')).toBe(true);
    expect(editor.textContent).toBe('第一段第二段');
  });

  it('writes only once when Kimi temporarily renders just part of a long prompt', () => {
    document.body.innerHTML = '<div role="textbox" contenteditable="true"></div>';
    const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
    (editor as any).getBoundingClientRect = () => ({ width: 300, height: 80 });
    const prompt = '前半部分：研究规则。后半部分：输出 JSON。';
    const insertText = vi.fn((_command: string, _showUi: boolean, text: string) => {
      // Kimi's controlled editor may briefly expose only part of the value
      // before its internal state catches up.
      editor.textContent = text.slice(0, Math.ceil(text.length / 2));
      return true;
    });
    (document as any).execCommand = insertText;

    expect(insertKimiResearchPrompt(prompt)).toBe(true);
    expect(insertKimiResearchPrompt(prompt)).toBe(true);
    expect(insertText).toHaveBeenCalledTimes(1);

    editor.textContent = '';
    expect(insertKimiResearchPrompt(prompt)).toBe(true);
    expect(editor.textContent).toBe('');
    expect(insertText).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch a second input event after the browser insertText transaction', () => {
    document.body.innerHTML = '<div role="textbox" contenteditable="true"></div>';
    const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
    (editor as any).getBoundingClientRect = () => ({ width: 300, height: 80 });
    const inputEvents = vi.fn();
    editor.addEventListener('input', inputEvents);
    (document as any).execCommand = vi.fn((_command: string, _showUi: boolean, text: string) => {
      editor.textContent = text;
      editor.dispatchEvent(new window.Event('input', { bubbles: true }));
      return true;
    });

    expect(insertKimiResearchPrompt('只写入一次')).toBe(true);
    expect(inputEvents).toHaveBeenCalledTimes(1);
  });

  it('refuses to write on a non-Kimi host', () => {
    dom?.reconfigure({ url: 'https://example.com/' });
    const editor = document.querySelector('textarea') as HTMLTextAreaElement;
    (editor as any).getBoundingClientRect = () => ({ width: 300, height: 80 });

    expect(insertKimiResearchPrompt('研究这张截图')).toBe(false);
    expect(editor.value).toBe('');
  });
});
