'use strict';

const { detectExcelLanguages, languageLabel } = require('./languages');
const { validateExcelForLayout } = require('./validate-excel');
const { validateLocaleRoot } = require('../_shared/locale-structure');

/**
 * TUI manifest for the "i18n update from Excel" pipeline.
 *
 * Step order matters: `layout` is asked BEFORE `excel` so the Excel file can be
 * validated against the chosen layout's expected structure (and the language
 * picker can read the file that follows).
 */
module.exports = {
  id: 'i18n-update',
  title: 'Cập nhật i18n từ Excel',
  description:
    'Đọc file Excel dịch thuật, so sánh & áp dụng thay đổi vào các file locale (common.json), rồi format bằng Prettier.',
  entry: 'run.js',
  order: 1,
  // The report/output files (diff, report, notices, merged excel) are optional —
  // the real result is the updated locale files. When the "keepReports" setting
  // is off, these are written to a temp dir and discarded (no irl-output folder).
  optionalOutputs: true,
  inputs: [
    {
      name: 'projectRoot',
      type: 'folder',
      label: 'Thư mục dự án (chứa src/i18n/locales)',
      hint: 'Kéo-thả thư mục gốc của repo vào đây rồi Enter.',
      required: true,
      cache: true,
      // Deep structure check (has src/i18n/locales + ≥1 <lang>/common.json).
      validate: (v) => validateLocaleRoot(v).error || null,
      pass: { kind: 'env', key: 'IRL_PROJECT_ROOT' },
    },
    {
      name: 'layout',
      type: 'select',
      label: 'Bố cục Excel',
      required: true,
      cache: true,
      default: 'paired',
      choices: [
        { value: 'paired', label: 'Paired — 2 cột/ngôn ngữ (current + updated) [mặc định]' },
        { value: 'single', label: 'Single — 1 cột/ngôn ngữ (header "<lang> (ngày)")' },
        { value: 'multi', label: 'Multi — nhiều cột/ngôn ngữ (lấy cột phải nhất, so với JSON)' },
      ],
      pass: { kind: 'flag', key: '--layout' },
    },
    {
      name: 'excel',
      type: 'file',
      label: 'File Excel dịch thuật (.xlsx)',
      hint: 'Kéo-thả file Excel vào đây rồi Enter.',
      required: true,
      cache: true,
      // Validate the file against the layout picked in the previous step.
      validate: (v, values) => validateExcelForLayout(v, values.layout).error || null,
      pass: { kind: 'arg' },
    },
    {
      name: 'languages',
      type: 'multiselect',
      label: 'Ngôn ngữ cập nhật vào common.json',
      hint: 'Space để bật/tắt · mặc định chọn tất cả · bỏ chọn để không cập nhật ngôn ngữ đó.',
      required: true,
      cache: true,
      default: 'all', // all detected languages checked by default
      // Only for the multi layout, and only when the Excel actually has
      // detectable language columns (otherwise skip and update everything).
      when: (v) => v.layout === 'multi' && detectExcelLanguages(v.excel).length > 0,
      // Dynamic choices: the languages found in the chosen Excel file, labelled
      // with their Vietnamese name (unknown codes show the raw code).
      choices: (v) =>
        detectExcelLanguages(v.excel).map((code) => ({ value: code, label: languageLabel(code) })),
      pass: { kind: 'flag', key: '--languages' },
    },
  ],
};
