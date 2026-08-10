#!/usr/bin/env node
/**
 * Lightweight "build" step for a pure-JS project: syntax-check every source
 * file with `node --check` so a broken file fails CI (and the pre-commit hook)
 * before it can be merged. No bundling/transpiling is needed for this package.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['bin', 'src', 'tools', 'scripts', 'test'];
const IGNORE = new Set(['node_modules', '.git', 'irl-output']);

/** Recursively collect every .js / .mjs / .cjs file under the given dir. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collect(full));
    } else if (/\.(mjs|cjs|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => {
  const full = path.join(ROOT, d);
  try {
    return statSync(full).isDirectory() ? collect(full) : [];
  } catch {
    return [];
  }
});

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✖ Syntax error in ${path.relative(ROOT, file)}`);
    console.error(String(err.stderr || err.message).trim());
  }
}

if (failed > 0) {
  console.error(`\n${failed} file(s) failed the syntax check.`);
  process.exit(1);
}

console.log(`✓ Syntax check passed for ${files.length} file(s).`);
