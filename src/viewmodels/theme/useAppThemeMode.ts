import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APP_THEME_MODE_STORAGE_KEY,
  buildAppThemeModeStoragePatch,
  normalizeAppThemeMode,
  resolveAppThemeModeFromStorage,
  type AppThemeMode,
} from '@services/protocols/app-theme';
import { storageGet, storageOnChanged, storageSet } from '@services/shared/storage';

export type UseAppThemeModeResult = {
  mode: AppThemeMode;
  update: (mode: AppThemeMode) => Promise<void>;
};

export type UseAppThemeModeOptions = {
  /**
   * Scope theme tokens to this element. Passing an options object deliberately
   * disables the document fallback until the target exists, which prevents an
   * in-page sidebar from changing the host website's theme.
   */
  target?: HTMLElement | null;
};

export function applyAppThemeMode(mode: AppThemeMode, target?: HTMLElement | null) {
  const root = target ?? globalThis.document?.documentElement;
  if (!root) return;

  const normalized = normalizeAppThemeMode(mode);
  if (normalized === 'system') {
    root.removeAttribute('data-theme-mode');
    root.style.colorScheme = '';
    return;
  }

  root.setAttribute('data-theme-mode', normalized);
  root.style.colorScheme = normalized === 'sepia' || normalized === 'light' ? 'light' : 'dark';
}

export function useAppThemeMode(options?: UseAppThemeModeOptions): UseAppThemeModeResult {
  const [mode, setMode] = useState<AppThemeMode>('system');
  const modeRef = useRef<AppThemeMode>(mode);
  modeRef.current = mode;
  const themeTarget = options === undefined ? globalThis.document?.documentElement : options.target;

  useEffect(() => {
    if (!themeTarget) return;
    applyAppThemeMode(mode, themeTarget);
  }, [mode, themeTarget]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const stored = await storageGet([APP_THEME_MODE_STORAGE_KEY]);
        if (disposed) return;
        setMode(resolveAppThemeModeFromStorage(stored));
      } catch (error) {
        console.warn('[theme] failed to load app theme mode', {
          error: error instanceof Error ? error.message : String(error || ''),
        });
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = storageOnChanged((changes, areaName) => {
      if (areaName && areaName !== 'local') return;
      const change = changes?.[APP_THEME_MODE_STORAGE_KEY];
      if (!change) return;
      setMode(normalizeAppThemeMode((change as { newValue?: unknown }).newValue));
    });
    return unsubscribe;
  }, []);

  const update = useCallback(async (nextMode: AppThemeMode) => {
    const normalized = normalizeAppThemeMode(nextMode);
    if (normalized === modeRef.current) return;

    modeRef.current = normalized;
    setMode(normalized);

    try {
      await storageSet(buildAppThemeModeStoragePatch(normalized));
    } catch (error) {
      console.warn('[theme] failed to save app theme mode', {
        error: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }, []);

  return { mode, update };
}
