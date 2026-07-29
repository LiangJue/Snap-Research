import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import ReactDOM from 'react-dom/client';
import { JSDOM } from 'jsdom';

const storageMocks = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(),
  onChanged: vi.fn(() => () => {}),
}));

vi.mock('../../src/services/shared/storage', () => ({
  storageGet: storageMocks.get,
  storageSet: storageMocks.set,
  storageOnChanged: storageMocks.onChanged,
}));

import { useReaderPrefs } from '../../src/viewmodels/reader/useReaderPrefs';
import { useAppThemeMode } from '../../src/viewmodels/theme/useAppThemeMode';

function ReaderPrefsHarness() {
  const { prefs, update } = useReaderPrefs();
  return createElement(
    'button',
    {
      type: 'button',
      'data-font-size': String(prefs.fontSize),
      onClick: () => void update({ fontSize: 24 }),
    },
    String(prefs.fontSize),
  );
}

function ThemeModeHarness() {
  const { mode, update } = useAppThemeMode({
    target: document.getElementById('theme-target'),
  });
  return createElement(
    'button',
    {
      type: 'button',
      'data-theme-mode': mode,
      onClick: () => void update('black'),
    },
    mode,
  );
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="theme-target"></div><div id="root"></div></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });

  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: dom.window.Element });
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
}

function cleanupDom() {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).navigator;
  delete (globalThis as any).HTMLElement;
  delete (globalThis as any).Element;
  delete (globalThis as any).Node;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
}

describe('reader settings persistence', () => {
  let root: ReactDOM.Root | null = null;

  beforeEach(() => {
    setupDom();
    storageMocks.get.mockReset();
    storageMocks.get.mockResolvedValue({});
    storageMocks.set.mockReset();
    storageMocks.onChanged.mockReset();
    storageMocks.onChanged.mockReturnValue(() => {});
    root = ReactDOM.createRoot(document.getElementById('root')!);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    cleanupDom();
  });

  it('updates typography immediately while the storage write is still pending', async () => {
    storageMocks.set.mockImplementation(() => new Promise<void>(() => {}));
    await act(async () => {
      root!.render(createElement(ReaderPrefsHarness));
      await Promise.resolve();
    });

    const button = document.querySelector('button') as HTMLButtonElement;
    expect(button.dataset.fontSize).not.toBe('24');

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(button.dataset.fontSize).toBe('24');
  });

  it('updates the theme immediately while the storage write is still pending', async () => {
    storageMocks.set.mockImplementation(() => new Promise<void>(() => {}));
    await act(async () => {
      root!.render(createElement(ThemeModeHarness));
      await Promise.resolve();
    });

    const button = document.querySelector('button') as HTMLButtonElement;
    expect(button.dataset.themeMode).toBe('system');

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(button.dataset.themeMode).toBe('black');
    expect(document.getElementById('theme-target')?.getAttribute('data-theme-mode')).toBe('black');
    expect(document.documentElement.hasAttribute('data-theme-mode')).toBe(false);
  });
});
