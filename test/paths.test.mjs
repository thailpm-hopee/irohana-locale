import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { sanitizeDraggedPath } from '../src/paths.mjs';

test('sanitizeDraggedPath trims whitespace', () => {
  assert.equal(sanitizeDraggedPath('  /tmp/foo  '), '/tmp/foo');
});

test('sanitizeDraggedPath strips a single pair of surrounding quotes', () => {
  assert.equal(sanitizeDraggedPath("'/tmp/My File.xlsx'"), '/tmp/My File.xlsx');
  assert.equal(sanitizeDraggedPath('"/tmp/My File.xlsx"'), '/tmp/My File.xlsx');
});

test('sanitizeDraggedPath unescapes shell-escaped characters in unquoted paths', () => {
  assert.equal(sanitizeDraggedPath('/tmp/My\\ File.xlsx'), '/tmp/My File.xlsx');
});

test('sanitizeDraggedPath expands a leading ~', () => {
  assert.equal(sanitizeDraggedPath('~'), os.homedir());
  assert.equal(sanitizeDraggedPath('~/Documents'), path.join(os.homedir(), 'Documents'));
});

test('sanitizeDraggedPath returns empty string for blank input', () => {
  assert.equal(sanitizeDraggedPath(''), '');
  assert.equal(sanitizeDraggedPath('   '), '');
  assert.equal(sanitizeDraggedPath(null), '');
});
