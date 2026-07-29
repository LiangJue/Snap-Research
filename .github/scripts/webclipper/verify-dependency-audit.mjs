import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const allowedAdvisory = 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2';
const allowedRouterImports = new Set([
  'HashRouter',
  'Link',
  'Navigate',
  'Route',
  'Routes',
  'useLocation',
  'useNavigate',
]);
const forbiddenRouterRuntime =
  /react-router(?:-dom)?\/(?:server|rsc)|RSCHydratedRouter|RSCStaticRouter|createCallServer|routeRSCServerRequest|ServerRouter|createStaticHandler|createRequestHandler/;

function sourceFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.[cm]?[jt]sx?$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function verifyClientOnlyRouterUsage() {
  for (const path of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(path, 'utf8');
    if (forbiddenRouterRuntime.test(text)) {
      throw new Error(`Server/RSC React Router API found in ${relative(root, path)}`);
    }
    for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-router-dom['"]/g)) {
      const names = match[1]
        .split(',')
        .map((value) => value.trim().split(/\s+as\s+/i)[0])
        .filter(Boolean);
      const unsupported = names.filter((name) => !allowedRouterImports.has(name));
      if (unsupported.length) {
        throw new Error(`Unreviewed React Router import in ${relative(root, path)}: ${unsupported.join(', ')}`);
      }
    }
  }
}

function auditReport() {
  const windows = process.platform === 'win32';
  const command = windows ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = windows ? ['/d', '/s', '/c', 'npm audit --json'] : ['audit', '--json'];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!String(result.stdout || '').trim()) {
    throw new Error(String(result.stderr || '').trim() || 'npm audit did not return JSON');
  }
  return JSON.parse(result.stdout);
}

verifyClientOnlyRouterUsage();
const audit = auditReport();
const vulnerabilities = Object.values(audit.vulnerabilities || {});
const unexpected = vulnerabilities.filter((item) => {
  if (!['react-router', 'react-router-dom'].includes(item.name)) return true;
  return item.via.some((via) => typeof via !== 'string' && via.url !== allowedAdvisory);
});

if (unexpected.length) {
  const summary = unexpected.map((item) => `${item.name}:${item.severity}`).join(', ');
  throw new Error(`Unaccepted dependency advisories: ${summary}`);
}

if (vulnerabilities.length) {
  console.log('Dependency audit passed with one documented client-inapplicable React Router RSC advisory.');
} else {
  console.log('Dependency audit passed with no advisories.');
}
