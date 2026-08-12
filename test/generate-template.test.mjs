import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const {
  TEMPLATE_LAYOUTS,
  TEMPLATE_SHEET,
  GUIDE_SHEET,
  buildTemplateWorkbook,
} = require('../tools/generate-excel-template/build-template.js');
const { validateExcelForLayout } = require('../tools/i18n-update/validate-excel.js');

const FIXED_DATE = new Date('2026-08-10T00:00:00Z');

/** Write a workbook to a temp file; returns { file, dir }. */
function writeWb(wb) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'irl-tpl-'));
  const file = path.join(dir, 'tpl.xlsx');
  XLSX.writeFile(wb, file);
  return { file, dir };
}

for (const layout of TEMPLATE_LAYOUTS) {
  test(`buildTemplateWorkbook(${layout}): has Template + Guide sheets and round-trips through the validator`, () => {
    const wb = buildTemplateWorkbook({ layout, date: FIXED_DATE });
    // Two sheets, in order: Template first (so the validator reads it), Guide second.
    assert.deepEqual(wb.SheetNames, [TEMPLATE_SHEET, GUIDE_SHEET]);

    const { file, dir } = writeWb(wb);
    try {
      const res = validateExcelForLayout(file, layout);
      assert.equal(res.ok, true, res.ok ? '' : res.error);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('buildTemplateWorkbook: respects a language subset for single/multi headers', () => {
  const wb = buildTemplateWorkbook({ layout: 'single', languages: ['vi'], date: FIXED_DATE });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[TEMPLATE_SHEET], { header: 1, defval: '' });
  // Header: JSON Key + exactly one language column.
  assert.equal(rows[0].length, 2);
  assert.match(String(rows[0][1]), /^vi \(/);
});

test('buildTemplateWorkbook: throws on an invalid layout', () => {
  assert.throws(() => buildTemplateWorkbook({ layout: 'nope' }), /layout không hợp lệ/);
});

test('buildTemplateWorkbook: throws when no valid language is selected', () => {
  assert.throws(() => buildTemplateWorkbook({ layout: 'single', languages: ['zz'] }), /ngôn ngữ/);
});
