import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateLocaleRoot } = require('../tools/_shared/locale-structure.js');

/** Make a throwaway temp dir; caller removes it. */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'irl-locale-'));
}

/** Create <root>/src/i18n/locales/<lang>/common.json with `{}`. */
function makeLocale(root, lang) {
  const dir = path.join(root, 'src', 'i18n', 'locales', lang);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'common.json'), '{}');
}

test('validateLocaleRoot: valid root with one language passes', () => {
  const root = tmpDir();
  try {
    makeLocale(root, 'vi');
    const res = validateLocaleRoot(root);
    assert.equal(res.ok, true);
    assert.deepEqual(res.languages, ['vi']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validateLocaleRoot: lists multiple languages sorted', () => {
  const root = tmpDir();
  try {
    makeLocale(root, 'vi');
    makeLocale(root, 'en');
    makeLocale(root, 'ja');
    const res = validateLocaleRoot(root);
    assert.equal(res.ok, true);
    assert.deepEqual(res.languages, ['en', 'ja', 'vi']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validateLocaleRoot: missing src/i18n/locales fails with a fix hint', () => {
  const root = tmpDir();
  try {
    const res = validateLocaleRoot(root);
    assert.equal(res.ok, false);
    assert.match(res.error, /src\/i18n\/locales/);
    assert.match(res.error, /Cách khắc phục/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validateLocaleRoot: locales dir with no common.json fails', () => {
  const root = tmpDir();
  try {
    // Create the locales dir and a language dir but WITHOUT common.json.
    fs.mkdirSync(path.join(root, 'src', 'i18n', 'locales', 'vi'), { recursive: true });
    const res = validateLocaleRoot(root);
    assert.equal(res.ok, false);
    assert.match(res.error, /common\.json/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validateLocaleRoot: locales path that is a file fails', () => {
  const root = tmpDir();
  try {
    fs.mkdirSync(path.join(root, 'src', 'i18n'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'i18n', 'locales'), 'not a dir');
    const res = validateLocaleRoot(root);
    assert.equal(res.ok, false);
    assert.match(res.error, /không phải là thư mục/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
