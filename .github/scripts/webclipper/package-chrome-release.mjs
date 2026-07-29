import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const repoRoot = resolve(import.meta.dirname, '../../..');
const buildRoot = resolve(repoRoot, '.output/chrome-mv3');
const manifest = JSON.parse(readFileSync(join(buildRoot, 'manifest.json'), 'utf8'));
const version = String(manifest.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid manifest version: ${version || '(empty)'}`);

const files = {};
const fixedMtime = new Date('1980-01-01T00:00:00.000Z');
const visit = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const absolutePath = join(dir, name);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      visit(absolutePath);
      continue;
    }
    if (!stat.isFile()) continue;
    const archivePath = relative(buildRoot, absolutePath).split(sep).join('/');
    if (archivePath.endsWith('.map')) throw new Error(`Source map must not enter release package: ${archivePath}`);
    files[archivePath] = [new Uint8Array(readFileSync(absolutePath)), { mtime: fixedMtime }];
  }
};
visit(buildRoot);

const outputDir = resolve(repoRoot, '.output/release');
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `snap-research-v${version}-chrome.zip`);
writeFileSync(outputPath, zipSync(files, { level: 9 }));

console.log(`${basename(outputPath)}\t${Object.keys(files).length} files\t${outputPath}`);
