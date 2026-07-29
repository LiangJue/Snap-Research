import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type UserManifestFn } from 'wxt';
import { removeKatexQuirksModeWarning } from './build/katex-quirks-warning';

const viteAlias = {
  '@ui': path.resolve('src/ui'),
  '@viewmodels': path.resolve('src/viewmodels'),
  '@services': path.resolve('src/services'),
  '@platform': path.resolve('src/platform'),
  '@collectors': path.resolve('src/collectors'),
  '@entrypoints': path.resolve('src/entrypoints'),
  '@i18n': path.resolve('src/ui/i18n'),
};

function firstExistingPath(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function resolveChromiumBinaryForMac(): string | undefined {
  const configured = process.env.WXT_CHROME_BINARY?.trim();
  if (configured) return configured;

  const defaultChrome = firstExistingPath([
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ]);
  if (defaultChrome) return undefined;

  return firstExistingPath([
    '/Applications/Arc.app/Contents/MacOS/Arc',
    path.join(process.env.HOME ?? '', 'Applications/Arc.app/Contents/MacOS/Arc'),
  ]);
}

const chromeBinary = process.platform === 'darwin' ? resolveChromiumBinaryForMac() : undefined;

const resolveManifest: UserManifestFn = () => {
  const permissions: string[] = [
    'storage',
    'activeTab',
    'contextMenus',
    'tabs',
    'webNavigation',
    'scripting',
    'alarms',
    'clipboardWrite',
    'declarativeNetRequestWithHostAccess',
    'tabGroups',
  ];

  return {
    name: '__MSG_extName__',
    version: '0.3.4',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions,
    host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [
      {
        resources: ['icons/icon-128.png'],
        matches: [
          'https://chat.openai.com/*',
          'https://chatgpt.com/*',
          'https://www.chatgpt.com/*',
          'https://claude.ai/*',
          'https://gemini.google.com/*',
          'https://chat.deepseek.com/*',
          'https://chat.z.ai/*',
          'https://kimi.moonshot.cn/*',
          'https://kimi.com/*',
          'https://*.kimi.com/*',
          'https://www.doubao.com/*',
          'https://yuanbao.tencent.com/*',
          'https://poe.com/*',
          'https://*.notion.so/*',
          'https://app.notion.com/*',
          'https://*.app.notion.com/*',
          'http://*/*',
          'https://*/*',
        ],
      },
    ],
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  };
};

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  entrypointsDir: 'src/entrypoints',
  webExt: chromeBinary ? { binaries: { chrome: chromeBinary } } : undefined,
  vite: () => ({
    plugins: [
      {
        name: 'snap-research-katex-quirks-warning',
        enforce: 'pre',
        transform(code, id) {
          if (!/[\\/]katex[\\/]dist[\\/]katex\.(?:mjs|js)(?:\?|$)/.test(id)) return null;
          const transformed = removeKatexQuirksModeWarning(code);
          return transformed === code ? null : { code: transformed, map: null };
        },
      },
    ],
    // Chrome rejects Unicode noncharacters in content scripts even when their
    // byte sequence is valid UTF-8. Keep esbuild output ASCII-escaped so
    // dependency regexes such as KaTeX's `\uFFFF` ranges remain loadable.
    esbuild: {
      charset: 'ascii',
    },
    define: {
      __SYNCNOS_FEISHU_OAUTH_CLIENT_ID__: JSON.stringify(process.env.SYNCNOS_FEISHU_OAUTH_CLIENT_ID ?? ''),
      __SYNCNOS_FEISHU_OAUTH_TOKEN_EXCHANGE_PROXY_URL__: JSON.stringify(
        process.env.SYNCNOS_FEISHU_OAUTH_TOKEN_EXCHANGE_PROXY_URL ?? '',
      ),
      __SYNCNOS_RESEARCH_API_URL__: JSON.stringify(
        process.env.SYNCNOS_RESEARCH_API_URL ?? 'http://127.0.0.1:8787/v1/research',
      ),
    },
    resolve: {
      alias: viteAlias,
    },
    build: {
      // KaTeX/Recharts can legitimately push some chunks beyond Vite's default 500kB warning threshold.
      // Keep the warning signal meaningful by using a higher, extension-appropriate limit.
      chunkSizeWarningLimit: 2000,
    },
  }),
  manifest: resolveManifest,
});
