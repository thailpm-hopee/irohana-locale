import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { validateExcelForLayout } = require('../tools/i18n-update/validate-excel.js');

/** Write an array-of-arrays as the first sheet of a temp .xlsx; returns path. */
function writeXlsx(aoa) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'irl-xlsx-'));
  const file = path.join(dir, 'test.xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  XLSX.writeFile(wb, file);
  return { file, dir };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('single: header with language columns passes', () => {
  const { file, dir } = writeXlsx([
    ['JSON Key', 'vi (2026-08-10)', 'en (2026-08-10)'],
    ['home.title', 'Trang chủ', 'Home'],
  ]);
  try {
    const res = validateExcelForLayout(file, 'single');
    assert.equal(res.ok, true);
    assert.deepEqual(res.info.languages, ['vi', 'en']);
  } finally {
    cleanup(dir);
  }
});

test('single: header without recognizable language columns fails', () => {
  const { file, dir } = writeXlsx([
    ['JSON Key', 'Vietnamese', 'English'],
    ['home.title', 'Trang chủ', 'Home'],
  ]);
  try {
    const res = validateExcelForLayout(file, 'single');
    assert.equal(res.ok, false);
    assert.match(res.error, /Không phát hiện cột ngôn ngữ/);
    assert.match(res.error, /Tạo file Excel mẫu/);
  } finally {
    cleanup(dir);
  }
});

test('multi: multiple columns for one language passes', () => {
  const { file, dir } = writeXlsx([
    ['JSON Key', 'vi (2026-08-10)', 'vi (2026-08-10 rev1)'],
    ['home.title', 'Trang chu', 'Trang chủ'],
  ]);
  try {
    const res = validateExcelForLayout(file, 'multi');
    assert.equal(res.ok, true);
    assert.deepEqual(res.info.languages, ['vi']);
  } finally {
    cleanup(dir);
  }
});

test('paired: enough columns and a data row passes', () => {
  const { file, dir } = writeXlsx([
    ['JSON Key', 'ref', 'ja (2026-08-10 stg)', 'ja (2026-08-10 修正依頼)'],
    ['home.title', '', 'ホーム', ''],
  ]);
  try {
    const res = validateExcelForLayout(file, 'paired');
    assert.equal(res.ok, true);
    assert.equal(res.info.columns, 4);
  } finally {
    cleanup(dir);
  }
});

test('paired: too few columns fails mentioning the layout', () => {
  const { file, dir } = writeXlsx([
    ['JSON Key', 'ref'],
    ['home.title', 'x'],
  ]);
  try {
    const res = validateExcelForLayout(file, 'paired');
    assert.equal(res.ok, false);
    assert.match(res.error, /paired/);
  } finally {
    cleanup(dir);
  }
});

test('header-only file (no data rows) fails', () => {
  const { file, dir } = writeXlsx([['JSON Key', 'vi (2026-08-10)']]);
  try {
    const res = validateExcelForLayout(file, 'single');
    assert.equal(res.ok, false);
    assert.match(res.error, /không có dòng dữ liệu/);
  } finally {
    cleanup(dir);
  }
});

test('non-Excel extension fails before reading', () => {
  const res = validateExcelForLayout('/tmp/does-not-exist.csv', 'single');
  assert.equal(res.ok, false);
  assert.match(res.error, /không phải định dạng Excel/);
});
