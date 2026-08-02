'use strict';

/**
 * TUI manifest for the "i18n update from Excel" pipeline.
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
      pass: { kind: 'env', key: 'IRL_PROJECT_ROOT' },
    },
    {
      name: 'excel',
      type: 'file',
      label: 'File Excel dịch thuật (.xlsx)',
      hint: 'Kéo-thả file Excel vào đây rồi Enter.',
      required: true,
      cache: true,
      pass: { kind: 'arg' },
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
      ],
      pass: { kind: 'flag', key: '--layout' },
    },
  ],
};
