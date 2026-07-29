import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { JSDOM } from 'jsdom';

import {
  DEFAULT_READER_PREFS,
  DEFAULT_READER_TYPOGRAPHY_PRESET,
  normalizeReaderPrefs,
  type ReaderPrefs,
} from '../../src/services/protocols/reader-prefs';
import { ReaderHeaderToolbar } from '../../src/ui/reader/ReaderHeaderToolbar';
import { MenuPopover } from '../../src/ui/shared/MenuPopover';

function SettingsHarness() {
  const [outerOpen, setOuterOpen] = useState(true);
  const [prefs, setPrefs] = useState<ReaderPrefs>(() =>
    normalizeReaderPrefs({
      ...DEFAULT_READER_PREFS,
      fontFamily: 'serif',
      textAlign: 'left',
      fontSize: 24,
      lineHeight: 1.8,
      contentWidth: 900,
      letterSpacing: 0.02,
    }),
  );
  const [themeMode, setThemeMode] = useState('system' as const | 'light' | 'sepia' | 'dark' | 'black');

  const updatePrefs = (patch: Partial<ReaderPrefs>) => {
    setPrefs((current) =>
      normalizeReaderPrefs({
        ...current,
        ...patch,
        tts: { ...current.tts, ...(patch.tts ?? {}) },
      }),
    );
  };

  return createElement(
    'div',
    null,
    createElement('output', {
      'data-current-font': prefs.fontFamily,
      'data-current-align': prefs.textAlign,
      'data-current-font-size': String(prefs.fontSize),
      'data-current-line-height': String(prefs.lineHeight),
      'data-current-content-width': String(prefs.contentWidth),
      'data-current-letter-spacing': String(prefs.letterSpacing),
      'data-current-theme': themeMode,
      'data-outer-open': String(outerOpen),
    }),
    createElement(
      MenuPopover,
      {
        open: outerOpen,
        onOpenChange: setOuterOpen,
        ariaLabel: 'More',
        trigger: (triggerProps) =>
          createElement(
            'button',
            {
              ...triggerProps,
              'data-testid': 'outer-trigger',
            },
            'More',
          ),
      },
      createElement(ReaderHeaderToolbar, {
        features: { textLayout: true, theme: true, narration: false },
        prefs,
        update: updatePrefs,
        themeMode,
        updateThemeMode: setThemeMode,
        narration: {
          state: 'idle',
          isPlaying: false,
          error: null,
          webSpeechAvailable: false,
          pause: () => {},
          stop: () => {},
          toggle: () => {},
        },
      }),
    ),
  );
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });

  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'HTMLInputElement', { configurable: true, value: dom.window.HTMLInputElement });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: dom.window.Element });
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, 'PointerEvent', {
    configurable: true,
    value: dom.window.PointerEvent ?? dom.window.MouseEvent,
  });
  Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(globalThis, 'KeyboardEvent', { configurable: true, value: dom.window.KeyboardEvent });
  Object.defineProperty(globalThis, 'Event', { configurable: true, value: dom.window.Event });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: dom.window.getComputedStyle.bind(dom.window),
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
}

function cleanupDom() {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).navigator;
  delete (globalThis as any).HTMLElement;
  delete (globalThis as any).HTMLInputElement;
  delete (globalThis as any).Element;
  delete (globalThis as any).Node;
  delete (globalThis as any).PointerEvent;
  delete (globalThis as any).MouseEvent;
  delete (globalThis as any).KeyboardEvent;
  delete (globalThis as any).Event;
  delete (globalThis as any).getComputedStyle;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
}

function setRangeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true, composed: true }));
}

describe('reader settings in the in-page Shadow DOM menu', () => {
  let root: ReactDOM.Root | null = null;
  let shadow: ShadowRoot | null = null;

  beforeEach(() => {
    setupDom();
    const host = document.createElement('div');
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    root = ReactDOM.createRoot(shadow);
    act(() => root!.render(createElement(SettingsHarness)));
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    shadow = null;
    cleanupDom();
  });

  it('connects every text-layout control through the nested menu', async () => {
    const output = shadow!.querySelector('output') as HTMLOutputElement;
    act(() => {
      (shadow!.querySelector('[data-reader-header-trigger="text"]') as HTMLButtonElement).click();
    });

    const selectTriggers = Array.from(
      shadow!.querySelectorAll('[data-reader-header-panel="text"] button[aria-haspopup="menu"]'),
    ) as HTMLButtonElement[];
    expect(selectTriggers).toHaveLength(2);

    await act(async () => {
      selectTriggers[0]!.click();
      await Promise.resolve();
    });
    const fontOptions = Array.from(
      selectTriggers[0]!.parentElement!.querySelectorAll('[role="menuitemradio"]'),
    ) as HTMLButtonElement[];
    expect(fontOptions).toHaveLength(3);
    await act(async () => {
      fontOptions[1]!.click();
      await Promise.resolve();
    });
    expect(output.dataset.currentFont).toBe('sans');
    expect(output.dataset.outerOpen).toBe('true');

    await act(async () => {
      selectTriggers[1]!.click();
      await Promise.resolve();
    });
    const alignOptions = Array.from(
      selectTriggers[1]!.parentElement!.querySelectorAll('[role="menuitemradio"]'),
    ) as HTMLButtonElement[];
    expect(alignOptions).toHaveLength(2);
    await act(async () => {
      alignOptions[1]!.click();
      await Promise.resolve();
    });
    expect(output.dataset.currentAlign).toBe('justify');
    expect(output.dataset.outerOpen).toBe('true');

    const ranges = Array.from(
      shadow!.querySelectorAll('[data-reader-header-panel="text"] input[type="range"]'),
    ) as HTMLInputElement[];
    expect(ranges).toHaveLength(4);
    act(() => {
      setRangeValue(ranges[0]!, '19');
      setRangeValue(ranges[1]!, '1.55');
      setRangeValue(ranges[2]!, '760');
      setRangeValue(ranges[3]!, '0.01');
    });
    expect(output.dataset.currentFontSize).toBe('19');
    expect(output.dataset.currentLineHeight).toBe('1.55');
    expect(output.dataset.currentContentWidth).toBe('760');
    expect(output.dataset.currentLetterSpacing).toBe('0.01');
    expect(output.dataset.outerOpen).toBe('true');

    const reset = shadow!.querySelector(
      '[data-reader-header-panel="text"] button:not([aria-haspopup="menu"])',
    ) as HTMLButtonElement;
    act(() => reset.click());
    expect(output.dataset.currentFont).toBe(DEFAULT_READER_TYPOGRAPHY_PRESET.fontFamily);
    expect(output.dataset.currentAlign).toBe(DEFAULT_READER_TYPOGRAPHY_PRESET.textAlign);
    expect(output.dataset.currentFontSize).toBe(String(DEFAULT_READER_TYPOGRAPHY_PRESET.fontSize));
    expect(output.dataset.currentLineHeight).toBe(String(DEFAULT_READER_TYPOGRAPHY_PRESET.lineHeight));
    expect(output.dataset.currentContentWidth).toBe(String(DEFAULT_READER_TYPOGRAPHY_PRESET.contentWidth));
    expect(output.dataset.currentLetterSpacing).toBe(String(DEFAULT_READER_TYPOGRAPHY_PRESET.letterSpacing));
  });

  it('connects every theme choice through the nested menu', async () => {
    const output = shadow!.querySelector('output') as HTMLOutputElement;
    act(() => {
      (shadow!.querySelector('[data-reader-header-trigger="theme"]') as HTMLButtonElement).click();
    });

    const choices = Array.from(shadow!.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
    expect(choices).toHaveLength(5);
    for (const [index, expected] of ['system', 'light', 'sepia', 'dark', 'black'].entries()) {
      await act(async () => {
        choices[index]!.click();
        await Promise.resolve();
      });
      expect(output.dataset.currentTheme).toBe(expected);
      expect(output.dataset.outerOpen).toBe('true');
    }
  });
});
