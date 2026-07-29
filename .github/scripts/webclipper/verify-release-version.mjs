import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.output', 'chrome-mv3', 'manifest.json'), 'utf8'));

if (packageJson.version !== manifest.version) {
  console.error(`Release version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}.`);
  process.exit(1);
}

console.log(`Release version is consistent (${packageJson.version}).`);
