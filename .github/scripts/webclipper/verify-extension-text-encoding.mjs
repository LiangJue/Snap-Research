import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

function readRootArg(argv) {
  const value = argv.find((arg) => arg.startsWith('--root='))?.slice('--root='.length);
  if (!value) throw new Error('missing --root=<extension output directory>');
  return path.resolve(value);
}

function isUnicodeNoncharacter(codePoint) {
  return (
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) === 0xfffe || (codePoint & 0xffff) === 0xffff
  );
}

async function listJavaScriptFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(absolute);
      }
    }
  };
  await visit(root);
  return files;
}

const root = readRootArg(process.argv.slice(2));
const decoder = new TextDecoder('utf-8', { fatal: true });
const failures = [];

for (const file of await listJavaScriptFiles(root)) {
  let text;
  try {
    text = decoder.decode(await fs.readFile(file));
  } catch (error) {
    failures.push(`${path.relative(root, file)}: invalid UTF-8 (${error instanceof Error ? error.message : error})`);
    continue;
  }

  let offset = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (isUnicodeNoncharacter(codePoint)) {
      failures.push(
        `${path.relative(root, file)}: Chrome-forbidden Unicode noncharacter U+${codePoint
          .toString(16)
          .toUpperCase()} at character ${offset}`,
      );
    }
    offset += character.length;
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Extension JavaScript encoding is Chrome-safe (${root})`);
}
